import {PluginDefinition} from "@yaakapp/api";
import { yaakToPostman } from './postman';

export const plugin: any = {
    httpRequestActions: [
        {
            label: "Hello, From Plugin",
            icon: "info",
            async onSelect(ctx: any, args: any) {
                await ctx.toast.show({
                    color: "success",
                    message: `You clicked the request ${args.httpRequest.id}`
                });
            },
        },
        {
            label: "Export to Postman",
            icon: "info",
            /**
             * This action converts the selected Yaak request into a Postman collection file
             * and writes it to the current working directory as `postman-<id>.json`.
             * In a more complete implementation you might prompt for a filename or
             * expose a CLI command instead.
             */
            async onSelect(ctx: any, args: any) {
                try {
                    const r = args.httpRequest;
                    const yaak = {
                        name: `Export - ${r.name || r.id}`,
                        requests: [
                            {
                                id: r.id,
                                name: r.name,
                                method: r.method,
                                url: r.url,
                                headers: r.headers,
                                body: r.body,
                                description: r.description,
                            },
                        ],
                    } as any;

                    const postman = yaakToPostman(yaak);
                    const json = JSON.stringify(postman, null, 2);
                    const filename = `postman-${r.id}.json`;
                    
                    // Write to current directory
                    await ctx.file.writeText(filename, json);
                    await ctx.toast.show({ color: 'success', message: `Wrote ${filename}` });
                } catch (err) {
                    await ctx.toast.show({ color: 'danger', message: `Export failed: ${String(err)}` });
                }
            },
        },
    ],

    httpCollectionActions: [
        {
            label: "Export Collection to Postman",
            icon: "info",
            /**
             * Export the selected folder/workspace as a Postman collection. This example
             * writes a minimal collection JSON with no requests (listing requests is
             * a follow-up feature), so it primarily demonstrates collection-level UI and
             * wiring rather than a full export.
             */
            async onSelect(ctx, args) {
                try {
                    const a: any = args;

                    const coll = {
                        name: `Export - ${a.folder?.name ?? a.workspace?.name ?? a.folder?.id ?? a.workspace?.id}`,
                        requests: [],
                    } as any;

                    // Ask the user for an output path
                    const last = (await ctx.store.get('postman_last_export_path')) || '';
                    const filePath = await ctx.prompt.text({
                        id: 'postman-export-path',
                        title: 'Export Collection',
                        label: 'Output file path',
                        description: 'Enter the full path where the Postman collection JSON should be saved (e.g., C:\\temp\\export.json or /tmp/export.json)',
                        defaultValue: last || undefined,
                        placeholder: last || 'C:\\tmp\\postman-collection.json',
                    });

                    if (!filePath) {
                        await ctx.toast.show({ color: 'notice', message: 'Export cancelled' });
                        return;
                    }

                    // Persist last-used path
                    try { await ctx.store.set('postman_last_export_path', filePath); } catch {}

                    // Gather requests and folders
                    const listArgs: any = {};
                    let workspaceId: string | undefined;
                    let selectedFolderId: string | undefined;
                    if (a.folder?.id) {
                        listArgs.folderId = a.folder.id;
                        workspaceId = a.folder.workspaceId;
                        selectedFolderId = a.folder.id;
                    } else if (a.workspace?.id) {
                        listArgs.workspaceId = a.workspace.id;
                        workspaceId = a.workspace.id;
                    }

                    const requests = await ctx.httpRequest.list(listArgs);
                    let allFolders = workspaceId ? await ctx.folder.list({ workspaceId }) : [];
                    
                    console.log('DEBUG: requests count', requests?.length);
                    console.log('DEBUG: folders count', allFolders?.length);
                    console.log('DEBUG: selectedFolderId', selectedFolderId);
                    console.log('DEBUG: all folders with parentId:', allFolders.map((f: any) => ({ id: f.id, name: f.name, parentId: f.parentId, folderId: f.folderId })));
                    console.log('DEBUG: all requests with folderId:', requests.map((r: any) => ({ id: r.id, name: r.name, folderId: r.folderId })).slice(0, 3));
                    
                    // When exporting a specific folder, filter to only include its descendants (not itself)
                    if (selectedFolderId) {
                        const getDescendants = (folderId: string): string[] => {
                            const ids = [];
                            for (const f of allFolders) {
                                if (f.folderId === folderId) {  // Use folderId not parentId
                                    ids.push(f.id);
                                    ids.push(...getDescendants(f.id));
                                }
                            }
                            return ids;
                        };
                        const descendantIds = getDescendants(selectedFolderId);
                        
                        // Keep only descendant folders
                        allFolders = allFolders.filter((f: any) => descendantIds.includes(f.id));
                        
                        // Keep only requests in the selected folder or its descendants
                        const exportScope = new Set([selectedFolderId, ...descendantIds]);
                        const filteredRequests = requests.filter((r: any) => 
                            r.folderId && exportScope.has(r.folderId)
                        );
                        console.log('DEBUG: filtered requests from', requests.length, 'to', filteredRequests.length);
                        requests.splice(0, requests.length, ...filteredRequests);
                    } else {
                        // When exporting root workspace, only include root-level requests (no folder)
                        const rootRequests = requests.filter((r: any) => !r.folderId || r.folderId === null);
                        console.log('DEBUG: filtered root requests from', requests.length, 'to', rootRequests.length);
                        requests.splice(0, requests.length, ...rootRequests);
                    }
                    
                    console.log('DEBUG: first request', requests?.[0]);
                    console.log('DEBUG: first folder', allFolders?.[0]);
                    
                    // Build hierarchy: organize folders and requests into nested structure
                    const buildHierarchy = (parentId: string | null): any[] => {
                        const children = [];
                        
                        // Add folders that have this parent
                        for (const folder of allFolders) {
                            if (folder.folderId === parentId) {  // Use folderId not parentId
                                children.push({
                                    id: folder.id,
                                    name: folder.name,
                                    description: folder.description,
                                    authentication: folder.authentication,
                                    items: buildHierarchy(folder.id),
                                });
                            }
                        }
                        
                        // Add requests that have this parent
                        for (const req of requests) {
                            if (req.folderId === parentId) {
                                children.push(req);
                            }
                        }
                        
                        return children;
                    };

                    // Build from root level OR from selected folder (which will be treated as the new root)
                    const startFrom = selectedFolderId ? selectedFolderId : null;
                    const items = buildHierarchy(startFrom);

                    // Get collection-level auth and variables
                    // When exporting root workspace, try to find a root-level folder with auth
                    let collectionAuth = selectedFolderId ? a.folder?.authentication : a.workspace?.authentication;
                    
                    // If no auth found yet and exporting root, look for the first root-level folder with actual auth
                    if ((!collectionAuth || Object.keys(collectionAuth || {}).length === 0) && !selectedFolderId) {
                        const rootFolders = allFolders.filter((f: any) => !f.folderId || f.folderId === null);
                        for (const rootFolder of rootFolders) {
                            if (rootFolder.authentication && Object.keys(rootFolder.authentication).length > 0) {
                                collectionAuth = rootFolder.authentication;
                                break;
                            }
                        }
                    }
                    
                    const collectionVariables: Record<string, string> = {};
                    
                    // Extract variables from all requests and folders (the ones in Yaak format ${[varName]})
                    const extractVariables = (text: string): string[] => {
                        const matches = text.match(/\$\{\[([^\]]+)\]\}/g) || [];
                        return matches.map(m => m.replace(/\$\{\[|\]\}/g, ''));
                    };
                    
                    const allUsedVariables = new Set<string>();
                    requests.forEach((req: any) => {
                        extractVariables(req.url || '').forEach(v => allUsedVariables.add(v));
                        if (req.body?.text) extractVariables(req.body.text).forEach(v => allUsedVariables.add(v));
                        if (Array.isArray(req.headers)) {
                            req.headers.forEach((h: any) => {
                                extractVariables(h.value || '').forEach(v => allUsedVariables.add(v));
                            });
                        }
                    });
                    
                    // Create a Postman environment with all found variables
                    const postmanEnv: any = {
                        name: `${a.folder?.name ?? a.workspace?.name} - Environment`,
                        values: Array.from(allUsedVariables).map(varName => ({
                            key: varName,
                            value: '',
                            type: 'string',
                            enabled: true,
                        })),
                    };

                    // Build a yaak object with proper hierarchy
                    const yaak = {
                        name: `Export - ${a.folder?.name ?? a.workspace?.name ?? a.folder?.id ?? a.workspace?.id}`,
                        items,
                        authentication: collectionAuth,
                        variables: collectionVariables,
                    } as any;

                    const postman = yaakToPostman(yaak);
                    const json = JSON.stringify(postman, null, 2);
                    
                    // Write collection to file
                    await ctx.file.writeText(filePath, json);
                    
                    // Environment export disabled for now - broken
                    // if (allUsedVariables.size > 0) {
                    //     const envPath = filePath.replace(/\.json$/, '-environment.json');
                    //     const envJson = JSON.stringify({
                    //         name: postmanEnv.name,
                    //         values: postmanEnv.values,
                    //     }, null, 2);
                    //     await ctx.file.writeText(envPath, envJson);
                    //     await ctx.toast.show({ color: 'success', message: `Exported collection and environment to ${filePath}` });
                    // } else {
                        await ctx.toast.show({ color: 'success', message: `Exported to ${filePath}` });
                    // }
                } catch (err) {
                    await ctx.toast.show({ color: 'danger', message: `Export failed: ${String(err)}` });
                }
            },
        },
    ],
};
