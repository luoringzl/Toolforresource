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
    ['通用规则', '请勿修改第一行表头；一行代表一条记录；百分比填写 0-100 的数字；多人姓名用顿号“、”分隔。']
  ]);
  help['!cols'] = [{ wch: 28 }, { wch: 95 }];
  XLSX.utils.book_append_sheet(book, data, '导入数据');
  XLSX.utils.book_append_sheet(book, help, '填写说明');
  XLSX.writeFile(book, path.join(output, filename));
}

makeWorkbook(projectHeaders, [
  ['项目名称', '必填，作为项目唯一识别名称；与已有项目同名时更新原记录。'],
  ['优先级', '建议填写：P0 紧急、P1 高、P2 中、P3 低。'],
  ['项目状态', '可填写：待启动、制作中、暂停、待验收、已完成、已取消。'],
  ['人员字段', '项目负责人/导演、PM、美术监制、视频制作人员、资产制作人员、其它支持均填写人员姓名；多人用顿号分隔。'],
  ['剧本等资料', '可填写内容摘要，也可填写本地文件或文件夹路径。软件离线运行，不会上传这些内容。'],
  ['进度字段', '填写 0-100 的数字，不要输入百分号。']
], '项目资料导入模板.xlsx');

makeWorkbook(peopleHeaders, [
  ['姓名', '必填，作为人员唯一识别名称；如存在同名人员，请在姓名后加入团队标识。'],
  ['职能', '建议填写：导演、项目经理 PM、美术监制、资产制作、视频制作、编剧、剪辑、技术支持、其它。'],
  ['标准产能', '通常填写 100；兼职或特殊人员可填写更低数值。'],
  ['参与项目', '填写项目全称或项目简称；多个项目用顿号分隔。建议先导入项目后再导入本字段。'],
  ['产能占用', '填写当前所有参与项目合计占用百分比；若有多个项目，导入时会平均分配。'],
  ['在岗状态', '可填写：在岗、请假、外包、离岗。']
], '人员资料导入模板.xlsx');

console.log(`Templates created in ${output}`);
