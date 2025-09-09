import { postJson } from '../src/collector/collector';

test('postJson throws on invalid URL', async () => {
  await expect(postJson('not-a-valid-url', { a: 1 })).rejects.toBeTruthy();
});
