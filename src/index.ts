import {PluginDefinition} from "@yaakapp/api";
import { yaakToPostman } from './postman';

export const plugin: any = {
    httpCollectionActions: [
        {
            label: "Export Collection to Postman",
            icon: "info",
            /**
             * Export the selected folder/workspace as a Postman collection.
             */
            async onSelect(ctx: any, args: any) {
                try {
                    const a: any = args;

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
                        requests.splice(0, requests.length, ...filteredRequests);
                    } else {
                        // When exporting root workspace, only include root-level requests (no folder)
                        const rootRequests = requests.filter((r: any) => !r.folderId || r.folderId === null);
                        requests.splice(0, requests.length, ...rootRequests);
                    }
                    
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
                    
                    await ctx.toast.show({ color: 'success', message: `Exported to ${filePath}` });
                } catch (err) {
                    await ctx.toast.show({ color: 'danger', message: `Export failed: ${String(err)}` });
                }
            },
        },
    ],
};
