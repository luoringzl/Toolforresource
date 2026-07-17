import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import XLSX from 'xlsx';
import { projectHeaders, peopleHeaders } from '../src/core.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'templates');
fs.mkdirSync(output, { recursive: true });

function makeWorkbook(headers, notes, filename) {
  const book = XLSX.utils.book_new();
  const data = XLSX.utils.aoa_to_sheet([headers]);
  data['!cols'] = headers.map(header => ({ wch: Math.max(12, Math.min(28, header.length * 2 + 4)) }));
  data['!autofilter'] = { ref: `A1:${XLSX.utils.encode_col(headers.length - 1)}1` };
  data['!freeze'] = { xSplit: 0, ySplit: 1, topLeftCell: 'A2', activePane: 'bottomLeft', state: 'frozen' };
  const help = XLSX.utils.aoa_to_sheet([
    ['字段', '填写说明'],
    ...notes,
    ['通用规则', '请勿修改第一行表头；一行代表一条记录；人员项目占用百分比允许合计超过 100%，软件会标记为超负荷。']
  ]);
  help['!cols'] = [{ wch: 28 }, { wch: 95 }];
  XLSX.utils.book_append_sheet(book, data, '导入数据');
  XLSX.utils.book_append_sheet(book, help, '填写说明');
  XLSX.writeFile(book, path.join(output, filename));
}

makeWorkbook(projectHeaders, [
  ['项目名称', '必填，作为项目唯一识别名称；与已有项目同名时更新原记录。'],
  ['优先级', '建议填写：P0 紧急、P1 高、P2 中、P3 低。'],
  ['项目状态', '可填写：待启动、制作中、资产制作中、资产制作完成、视频制作中、视频制作完成、反馈修改中、待验收、暂停、已完成、已取消。'],
  ['人员字段', '项目负责人/导演、PM、美术监制、视频制作人员、资产制作人员五个核心岗位均至少填写 1 人，也可填写多人；多人用顿号分隔。'],
  ['产能释放规则', '资产制作完成后资产制作人员自动释放；项目负责人/导演和视频制作人员直到项目已完成才释放。'],
  ['剧本等资料', '可填写内容摘要，也可填写本地文件或文件夹路径。软件离线运行，不会上传这些内容。'],
  ['进度字段', '填写 0-100 的数字，不要输入百分号。']
], '项目资料导入模板.xlsx');

makeWorkbook(peopleHeaders, [
  ['人员姓名', '必填，作为人员唯一识别名称；如存在同名人员，请在姓名后加入团队标识。'],
  ['归属部门', '可填写：AI项目组、UE引擎组、CG资产组、导演组、教培部门、商务部门、AI后期组。'],
  ['职位', '可填写：AI动画师、导演、UE蓝图动画师、UE场景设计师、AI后期、AI技术研究、CG资产师、商务、导演助理等。'],
  ['技能与等级', '格式：技能|等级；多项用中文分号分隔。示例：AI视频制作|高级；剪辑|中级。'],
  ['制作能力', '格式：技能|数量|单位|适用难度|备注。示例：AI视频制作|2|分钟/天|电影级|；AI资产制作|10|张/天||。'],
  ['AI项目及产能占用', '格式：项目名|占用百分比|项目角色|结束日期；多项用中文分号分隔。示例：项目A|60|视频制作人员|2026-08-31。'],
  ['其它部门项目及产能占用', '格式：项目名|归属部门|占用百分比|项目角色|结束日期。示例：内部培训|教培部门|20|讲师|2026-09-15。'],
  ['标准总产能', '通常填写 100；各项目占用合计允许超过该数值，超过后人员会被标记为超负荷。'],
  ['预计产能释放日期', '选填，仅用于排期参考；商务、PM 等持续性岗位或暂无明确日期时可留空。可安排与否按全部有效项目的产能占用合计判断。'],
  ['在岗状态', '可填写：在岗、请假、异动、停薪留岗、外包、离岗。']
], '人员资料导入模板.xlsx');

console.log(`Templates created in ${output}`);
