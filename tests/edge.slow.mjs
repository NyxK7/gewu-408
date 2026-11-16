// 边界值测试（慢，单独跑：node --test tests/edge.slow.mjs，大约几分钟）。
// 每节课、每个预设、每个参数都换成最小值、最大值、0、空、特别大的数、乱写的字符串……（表单收得进的才试），
// 要求：不崩溃，不卡死；讲解文字和画板里不出现 undefined / NaN。
import assert from 'node:assert/strict';
import test from 'node:test';
import { edgeLesson, lessonsWithParams } from './edge-kit.mjs';

for (const l of lessonsWithParams()) {
  test(`边界值：${l.id}`, { timeout: 60000 }, () => {
    const issues = edgeLesson(l);
    assert.deepEqual(issues.map((i) => `${i.field} = ${JSON.stringify(i.raw)}：${i.msg}`), []);
  });
}
