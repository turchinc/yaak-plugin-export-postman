import { describe, expect, test } from 'vitest';
import { yaakToPostman } from './postman';

describe('Postman Exporter', () => {
  test('converts a simple request', () => {
    const yaak = {
      name: 'My Col',
      items: [
        {
          id: '1',
          name: 'Get Thing',
          method: 'get',
          url: 'https://example.com/api/v1/things/1',
          headers: { Accept: 'application/json' },
          body: null,
          description: 'A test request',
        },
      ],
    };

    const postman = yaakToPostman(yaak as any);
    expect(postman.info.name).toBe('My Col');
    expect(postman.item).toHaveLength(1);
    expect(postman.item[0].name).toBe('Get Thing');
    expect(postman.item[0].request.method).toBe('GET');
    expect(postman.item[0].request.header[0]).toEqual({ key: 'Accept', value: 'application/json' });
    expect(postman.item[0].request.url.raw).toBe('https://example.com/api/v1/things/1');
  });

  test('includes variables at collection root', () => {
    const yaak = {
      name: 'With Vars',
      variables: { baseUrl: 'https://example.com' },
      items: [],
    };

    const postman = yaakToPostman(yaak as any);
    expect(postman.variable).toEqual([{ key: 'baseUrl', value: 'https://example.com' }]);
  });

  test('preserves folder hierarchy', () => {
    const yaak = {
      name: 'With Folders',
      items: [
        {
          id: 'folder1',
          name: 'API v1',
          items: [
            {
              id: '1',
              name: 'Get User',
              method: 'GET',
              url: 'https://api.example.com/users/1',
            },
          ],
        },
      ],
    };

    const postman = yaakToPostman(yaak as any);
    expect(postman.item).toHaveLength(1);
    expect(postman.item[0].name).toBe('API v1');
    expect(postman.item[0].item).toHaveLength(1);
    expect(postman.item[0].item[0].name).toBe('Get User');
  });
});
