import { describe, expect, test } from 'vitest';
import {plugin} from "./index";

describe('Example Plugin', () => {
    test('Exports plugin object', () => {
        expect(plugin).toBeTypeOf('object');
    });
    test('Has Export to Postman action', () => {
        expect(plugin.httpRequestActions?.some(a => a.label === 'Export to Postman')).toBe(true);
    });
    test('Has Export Collection to Postman action', () => {
        expect(plugin.httpCollectionActions?.some(a => a.label === 'Export Collection to Postman')).toBe(true);
    });
});
