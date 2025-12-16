export interface YaakRequest {
  id: string;
  name?: string;
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: string | null;
  description?: string;
  authentication?: Record<string, any>;
}

export interface YaakFolder {
  id: string;
  name: string;
  description?: string;
  authentication?: Record<string, any>;
  items: (YaakRequest | YaakFolder)[];
}

export interface YaakCollection {
  id?: string;
  name?: string;
  items: (YaakRequest | YaakFolder)[];
  variables?: Record<string, string>;
  description?: string;
  authentication?: Record<string, any>;
}

export function yaakToPostman(collection: YaakCollection) {
  const postman: any = {
    info: {
      name: collection.name || 'Yaak Export',
      _postman_id: collection.id || undefined,
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    },
    item: convertItems(collection.items),
  };

  if (collection.description) {
    postman.info.description = collection.description;
  }

  // Always add auth if provided (even if empty object, convertAuth will handle it)
  if (collection.authentication) {
    postman.auth = convertAuth(collection.authentication);
  }

  if (collection.variables && Object.keys(collection.variables).length > 0) {
    postman.variable = Object.entries(collection.variables).map(([k, v]) => ({ key: k, value: v }));
  }

  return postman;
}

function convertItems(items: (YaakRequest | YaakFolder)[]): any[] {
  return items.map(item => {
    if ('method' in item) {
      // It's a request
      return convertRequest(item as YaakRequest);
    } else {
      // It's a folder
      return convertFolder(item as YaakFolder);
    }
  });
}

function convertRequest(request: any): any {
  // Handle both array and object header formats
  let headers: any[] = [];
  if (Array.isArray(request.headers)) {
    headers = request.headers
      .filter((h: any) => h.enabled !== false && h.name)
      .map((h: any) => ({ key: h.name, value: h.value }));
  } else if (request.headers) {
    headers = Object.entries(request.headers).map(([k, v]) => ({ key: k, value: v }));
  }

  // Convert Yaak variable syntax ${[varName]} to Postman syntax {{varName}}
  const convertYaakVariables = (str: string): string => {
    return str.replace(/\$\{\[([^\]]+)\]\}/g, '{{$1}}');
  };

  // Parse URL into Postman format with host/path arrays
  const parsePostmanUrl = (urlStr: string): any => {
    const converted = convertYaakVariables(urlStr);
    const urlObj: any = { raw: converted };
    
    try {
      // Try to parse as full URL
      if (converted.startsWith('http://') || converted.startsWith('https://')) {
        const url = new URL(converted);
        urlObj.protocol = url.protocol.replace(':', '');
        urlObj.host = url.hostname.split('.');
        urlObj.port = url.port ? url.port : undefined;
        urlObj.path = url.pathname.split('/').filter((p: string) => p);
        if (url.search) urlObj.query = url.search.substring(1);
      } else {
        // Assume it's a path with host variable like {{host}}/path
        // Extract host variable and path
        const match = converted.match(/^({{[^}]+}}|[^/]+)(\/.*)?$/);
        if (match) {
          const hostPart = match[1];
          const pathPart = match[2] || '/';
          
          // If host contains variables or is not an IP, treat it as hostname
          urlObj.host = [hostPart];
          urlObj.path = pathPart.split('/').filter((p: string) => p);
        }
      }
    } catch (e) {
      // If parsing fails, just keep raw
    }
    
    return urlObj;
  };

  const postmanRequest: any = {
    name: request.name || request.id,
    request: {
      method: (request.method || 'GET').toUpperCase(),
      header: headers,
      url: parsePostmanUrl(request.url),
    },
  };

  // Handle body - could be string, object with text, or object with form
  if (request.body != null) {
    let body: any = { mode: 'raw', raw: '' };
    
    if (typeof request.body === 'string') {
      body.raw = convertYaakVariables(request.body);
    } else if (request.body.text) {
      body.raw = convertYaakVariables(request.body.text);
    } else if (request.body.form && Array.isArray(request.body.form) && request.body.form.length > 0) {
      body.mode = 'formdata';
      body.formdata = request.body.form
        .filter((f: any) => f.name)
        .map((f: any) => ({ key: f.name, value: convertYaakVariables(f.value), disabled: f.enabled === false }));
    }
    
    postmanRequest.request.body = body;
  }

  if (request.description) {
    postmanRequest.request.description = request.description;
  }

  if (request.authentication && Object.keys(request.authentication).length > 0) {
    postmanRequest.request.auth = convertAuth(request.authentication);
  }

  return postmanRequest;
}

function convertFolder(folder: YaakFolder): any {
  const postmanFolder: any = {
    name: folder.name,
    item: convertItems(folder.items),
  };

  if (folder.description) {
    postmanFolder.description = folder.description;
  }

  if (folder.authentication && Object.keys(folder.authentication).length > 0) {
    postmanFolder.auth = convertAuth(folder.authentication);
  }

  return postmanFolder;
}

function convertAuth(auth: Record<string, any>): any {
  // Handle empty or missing auth
  if (!auth || Object.keys(auth).length === 0) {
    return { type: 'noauth' };
  }
  
  // Convert Yaak variable syntax ${[varName]} to Postman syntax {{varName}}
  const convertYaakVariables = (str: string): string => {
    return str.replace(/\$\{\[([^\]]+)\]\}/g, '{{$1}}');
  };
  
  // Detect auth type from fields if not explicitly set
  let type = auth.type || auth.authenticationType || 'noauth';
  
  // Auto-detect auth type from available fields
  if (type === 'noauth') {
    if (auth.username && auth.password) {
      type = 'basic';
    } else if (auth.token) {
      type = 'bearer';
    } else if (auth.key && auth.value) {
      type = 'apikey';
    }
  }
  
  const postmanAuth: any = {
    type: type === 'noauth' || !type ? 'noauth' : type.toLowerCase(),
  };
  
  if (type.toLowerCase() === 'bearer') {
    postmanAuth.bearer = [
      {
        key: 'token',
        value: convertYaakVariables(auth.token || ''),
        type: 'string',
      },
    ];
  } else if (type.toLowerCase() === 'basic') {
    postmanAuth.basic = [
      {
        key: 'username',
        value: convertYaakVariables(auth.username || ''),
        type: 'string',
      },
      {
        key: 'password',
        value: convertYaakVariables(auth.password || ''),
        type: 'string',
      },
    ];
  } else if (type.toLowerCase() === 'apikey') {
    postmanAuth.apikey = [
      {
        key: 'key',
        value: convertYaakVariables(auth.key || ''),
        type: 'string',
      },
      {
        key: 'value',
        value: convertYaakVariables(auth.value || ''),
        type: 'string',
      },
      {
        key: 'in',
        value: convertYaakVariables(auth.in || 'header'),
        type: 'string',
      },
    ];
  }
  // For any other type, just return { type: 'noauth' }
  
  return postmanAuth;
}

export default yaakToPostman;
