(function (root) {
  'use strict';

  const CODE_GLOBAL_RE = /\b(\d{5}-\d{4}|\d{4}-\d{4}|0\d{7}|\d{8}|[A-Z]{2,8}[\dLI|OZ]{2,4})\b/gi;

  const KNOWN_TARGET_COURSES = {
    'GEBLC101': { name: 'ภาษาอังกฤษเพื่อการสื่อสารในชีวิตประจำวัน', credits: 3 },
    'GEBLC102': { name: 'ภาษาอังกฤษสำหรับการทำงาน', credits: 3 },
    'GEBLC103': { name: 'ภาษาอังกฤษเชิงวิชาการ', credits: 3 },
    'GEBLC104': { name: 'ภาษาอังกฤษเพื่อการสื่อสาร', credits: 3 },
    'GEBLC105': { name: 'ภาษาอังกฤษเพื่อทักษะการทำงาน', credits: 3 },
    'GEBLC106': { name: 'ภาษาอังกฤษในโลกดิจิทัล', credits: 3 },
    'GEBLC107': { name: 'ภาษาอังกฤษสำหรับวิศวกรรม', credits: 3 },
    'GEBLC108': { name: 'ภาษาอังกฤษเพื่อการประกอบธุรกิจ', credits: 3 },
    'GEBLC109': { name: 'ภาษาจีนเพื่อการสื่อสาร', credits: 3 },
    'GEBLC110': { name: 'สนทนาภาษาญี่ปุ่นพื้นฐาน', credits: 3 },
    'GEBLC111': { name: 'ภาษาเกาหลีเพื่อการสื่อสาร', credits: 3 },
    'GEBLC112': { name: 'ภาษาพม่าพื้นฐาน', credits: 3 },
    'GEBLC201': { name: 'ศิลปะการใช้ภาษาไทย', credits: 3 },
    'GEBLC202': { name: 'กลวิธีการเขียนรายงานและการนำเสนอ', credits: 3 },
    'GEBLC203': { name: 'วรรณกรรมท้องถิ่น', credits: 3 },
    'GEBLC204': { name: 'ภาษาไทยสำหรับชาวต่างประเทศ', credits: 3 },
    'GEBSC301': { name: 'เทคโนโลยีสารสนเทศที่จำเป็นในชีวิตประจำวัน', credits: 3 },
    'GEBSC302': { name: 'มโนทัศน์และเทคนิคทางวิทยาศาสตร์สมัยใหม่', credits: 3 },
    'GEBSC303': { name: 'กระบวนการทางวิทยาศาสตร์เพื่อทำงาน วิจัยและการสร้างนวัตกรรม', credits: 3 },
    'GEBSC304': { name: 'วิทยาศาสตร์เพื่อสุขภาพ', credits: 3 },
    'GEBSC305': { name: 'สิ่งแวดล้อมและการพัฒนาที่ยั่งยืน', credits: 3 },
    'GEBSC401': { name: 'คณิตศาสตร์และสถิติในชีวิตประจำวัน', credits: 3 },
    'GEBSC402': { name: 'สถิติและการวิเคราะห์ข้อมูลเบื้องต้น', credits: 3 },
    'GEBSO501': { name: 'การพัฒนาทักษะชีวิตและสังคม', credits: 3 },
    'GEBSO502': { name: 'ความรู้เบื้องต้นทางสังคม เศรษฐกิจ และการเมืองไทย', credits: 3 },
    'GEBSO503': { name: 'มนุษยสัมพันธ์', credits: 3 },
    'GEBSO504': { name: 'การพัฒนาศักยภาพมนุษย์และจิตวิทยาเชิงบวก', credits: 3 },
    'GEBSO505': { name: 'พลเมืองดิจิทัล', credits: 3 },
    'GEBSO506': { name: 'วัฒนธรรมและเศรษฐกิจสร้างสรรค์', credits: 3 },
    'GEBSO507': { name: 'ศาสตร์พระราชากับการพัฒนาที่ยั่งยืน', credits: 3 },
    'GEBSO508': { name: 'จิตวิทยาการจัดการองค์การในโลกยุคใหม่', credits: 3 },
    'GEBSO509': { name: 'มนุษย์กับจริยธรรมในศตวรรษที่ 21', credits: 3 },
    'GEBHT601': { name: 'กิจกรรมเพื่อสุขภาพ', credits: 3 },
    'GEBHT602': { name: 'การออกกำลังกายเพื่อสุขภาพ', credits: 3 },
    'GEBHT603': { name: 'กีฬาเพื่อสุขภาพ', credits: 3 },
    'GEBHT604': { name: 'นันทนาการเพื่อส่งเสริมสุขภาพ', credits: 3 },
    'GEBIN701': { name: 'กระบวนการคิดและการแก้ปัญหา', credits: 3 },
    'GEBIN702': { name: 'นวัตกรรมและเทคโนโลยี', credits: 3 },
    'GEBIN703': { name: 'ศิลปะการใช้ชีวิต', credits: 3 },
    'GEBIN704': { name: 'สุนทรียภาพและความงดงามของมนุษย์', credits: 3 },
    'FUNSC105': { name: 'ฟิสิกส์พื้นฐาน 1', credits: 3 },
    'FUNSC106': { name: 'ปฏิบัติการฟิสิกส์พื้นฐาน 1', credits: 1 },
    'FUNSC107': { name: 'ฟิสิกส์พื้นฐาน 2', credits: 3 },
    'FUNSC108': { name: 'ปฏิบัติการฟิสิกส์พื้นฐาน 2', credits: 1 },
    'FUNSC109': { name: 'ฟิสิกส์เบื้องต้น', credits: 3 },
    'FUNSC110': { name: 'ปฏิบัติการฟิสิกส์เบื้องต้น', credits: 1 },
    'FUNSC111': { name: 'ฟิสิกส์ยุคใหม่', credits: 3 },
    'FUNSC115': { name: 'ฟิสิกส์มูลฐานสำหรับวิศวกร', credits: 4 },
    'FUNSC116': { name: 'ฟิสิกส์ประยุกต์สำหรับวิศวกร', credits: 4 },
    'FUNSC117': { name: 'หลักฟิสิกส์', credits: 3 },
    'FUNSC118': { name: 'ฟิสิกส์สำหรับอุตสาหกรรมเกษตร', credits: 3 },
    'FUNSC119': { name: 'ฟิสิกส์ทางการเกษตร', credits: 3 },
    'FUNSC120': { name: 'ฟิสิกส์สำหรับอาหาร', credits: 3 },
    'FUNSC121': { name: 'ข้อมูลเชิงวิทยาศาสตร์สำหรับวิทยาการคอมพิวเตอร์', credits: 3 },
    'FUNSC203': { name: 'เคมีมูลฐานสำหรับวิศวกร', credits: 4 },
    'FUNSC204': { name: 'หลักเคมี', credits: 3 },
    'FUNSC205': { name: 'เคมีอินทรีย์', credits: 3 },
    'FUNSC206': { name: 'เคมีเชิงฟิสิกส์', credits: 3 },
    'FUNSC207': { name: 'เคมีวิเคราะห์', credits: 3 },
    'FUNSC208': { name: 'ชีวเคมีทางการเกษตร', credits: 3 },
    'FUNSC209': { name: 'เคมีสำหรับงานจักรกลเกษตร', credits: 3 },
    'FUNSC210': { name: 'เคมีเบื้องต้นสำหรับอุตสาหกรรมอาหาร', credits: 3 },
    'FUNSC211': { name: 'เคมีเบื้องต้นสำหรับอุตสาหกรรมเกษตร', credits: 3 },
    'FUNSC301': { name: 'ชีววิทยา', credits: 3 },
    'FUNSC302': { name: 'จุลชีววิทยาทั่วไป', credits: 3 },
    'FUNSC303': { name: 'ชีววิทยาพื้นฐานงานเครื่องจักรกลเกษตร', credits: 3 },
    'FUNMA102': { name: 'คณิตศาสตร์พื้นฐาน', credits: 3 },
    'FUNMA109': { name: 'สถิติ', credits: 3 },
    'FUNMA110': { name: 'แคลคูลัสและเรขาคณิตวิเคราะห์ 1', credits: 3 },
    'FUNMA111': { name: 'แคลคูลัสประยุกต์สำหรับวิศวกร', credits: 3 },
    'FUNMA112': { name: 'สมการเชิงอนุพันธ์และปัญหาค่าขอบ', credits: 3 },
    'FUNMA113': { name: 'แคลคูลัส 1', credits: 3 },
    'FUNMA114': { name: 'แคลคูลัส 2', credits: 3 },
    'FUNMA115': { name: 'คณิตศาสตร์เต็มหน่วย', credits: 3 },
    'FUNMA116': { name: 'ระเบียบวิธีเชิงตัวเลข', credits: 3 },
    'FUNMA117': { name: 'คณิตศาสตร์และสถิติ', credits: 3 },
    'FUNMA118': { name: 'สถิติและคณิตศาสตร์เพื่อการเกษตร', credits: 3 },
    'FUNMA119': { name: 'สถิติสำหรับวิทยาศาสตร์', credits: 3 },
    'FUNMA120': { name: 'สถิติและการใช้โปรแกรมสำเร็จรูปเพื่องานวิจัยทางเครื่องจักรกลเกษตร', credits: 3 },
    'FUNMA121': { name: 'แคลคูลัสสำหรับอุตสาหกรรมเกษตร', credits: 3 },
    'FUNMA122': { name: 'สถิติและการใช้โปรแกรมสำเร็จรูปทางสถิติในงานวิจัยอาหาร', credits: 3 }
  };

  const KNOWN_SOURCE_COURSES = {
    '30000-1201': 'ภาษาอังกฤษเพื่อการสื่อสาร',
    '30000-1202': 'ภาษาอังกฤษสำหรับการปฏิบัติงาน',
    '30000-1203': 'การสนทนาภาษาอังกฤษในสถานประกอบการ',
    '30000-1204': 'ภาษาอังกฤษโครงงาน',
    '30000-1207': 'ภาษาอังกฤษธุรกิจ',
    '30000-1214': 'ภาษาอังกฤษเทคโนโลยีสารสนเทศ',
    '30000-1218': 'ภาษาและวัฒนธรรมจีน',
    '30000-1219': 'การสนทนาภาษาจีนเพื่อการทำงาน',
    '30000-1220': 'ภาษาและวัฒนธรรมญี่ปุ่น',
    '30000-1221': 'การสนทนาภาษาญี่ปุ่นเพื่อการทำงาน',
    '30000-1222': 'ภาษาและวัฒนธรรมเกาหลี',
    '30000-1223': 'การสนทนาภาษาเกาหลีเพื่อการทำงาน',
    '30000-1230': 'ภาษาและวัฒนธรรมพม่า',
    '30000-1231': 'การสนทนาภาษาพม่าเพื่อการทำงาน',
    '30000-1101': 'ทักษะภาษาไทยเชิงวิชาชีพ',
    '30000-1102': 'การเขียนและการพูดเชิงวิชาชีพ',
    '30000-1104': 'ทักษะภาษาไทยเชิงสร้างสรรค์',
    '30001-2001': 'เทคโนโลยีสารสนเทศเพื่อการอาชีพ',
    '30000-1301': 'การจัดการทรัพยากรธรรมชาติ พลังงานและสิ่งแวดล้อม',
    '30000-1302': 'การวิจัยเบื้องต้น',
    '30000-1303': 'วิทยาศาสตร์งานไฟฟ้า อิเล็กทรอนิกส์และการสื่อสาร',
    '30000-1304': 'วิทยาศาสตร์งานเครื่องกลและการผลิต',
    '30000-1305': 'วิทยาศาสตร์เทคโนโลยียาง',
    '30000-1306': 'วิทยาศาสตร์งานก่อสร้างและตกแต่งภายใน',
    '30000-1309': 'วิทยาศาสตร์งานศิลปะและงานออกแบบ',
    '30000-1313': 'ฟิสิกส์เพื่อการเดินเรือ 1',
    '30000-1314': 'ฟิสิกส์เพื่อการเดินเรือ 2',
    '30000-1401': 'คณิตศาสตร์และสถิติเพื่องานอาชีพ',
    '30000-1402': 'คณิตศาสตร์เพื่อพัฒนาทักษะการคิด',
    '30000-1403': 'สถิติและการวางแผนการทดลอง',
    '30000-1404': 'แคลคูลัส 1',
    '30000-1405': 'แคลคูลัส 2',
    '30000-1407': 'คณิตศาสตร์อุตสาหกรรม',
    '30000-1408': 'คณิตศาสตร์ธุรกิจและบริการ',
    '30000-1409': 'คณิตศาสตร์เกษตรกรรม',
    '30000-1501': 'ชีวิตกับสังคมไทย',
    '30000-1502': 'ศาสตร์พระราชา',
    '30000-1503': 'การเมืองการปกครองของไทย',
    '30000-1602': 'การคิดอย่างเป็นระบบ',
    '30000-1604': 'คุณภาพชีวิตเพื่อการทำงาน',
    '30504-1001': 'จุลชีววิทยาทั่วไป',
    '3000-1201': 'ภาษาอังกฤษเพื่อการสื่อสารทางธุรกิจและสังคม',
    '3000-1203': 'ภาษาอังกฤษสำหรับการปฏิบัติงาน',
    '3000-1204': 'ภาษาอังกฤษโครงงาน',
    '3000-1206': 'การสนทนาภาษาอังกฤษ 1',
    '3000-1207': 'การสนทนาภาษาอังกฤษ 2',
    '3000-1208': 'ภาษาอังกฤษธุรกิจในงานอาชีพ',
    '3000-9201': 'ภาษาและวัฒนธรรมจีน',
    '3000-9202': 'การสนทนาภาษาจีนสำหรับการทำงาน',
    '3000-9203': 'ภาษาและวัฒนธรรมญี่ปุ่น',
    '3000-9204': 'การสนทนาภาษาญี่ปุ่นสำหรับการทำงาน',
    '3000-9205': 'ภาษาและวัฒนธรรมเกาหลี',
    '3000-9206': 'การสนทนาภาษาเกาหลีสำหรับการทำงาน',
    '3000-9213': 'ภาษาและวัฒนธรรมพม่า',
    '3000-9214': 'การสนทนาภาษาพม่าสำหรับการทำงาน',
    '3000-1101': 'ภาษาไทยเพื่อสื่อสารในงานอาชีพ',
    '3000-1102': 'การเขียนเชิงวิชาชีพ',
    '3000-1104': 'การพูดเพื่อสื่อสารงานอาชีพ',
    '3000-1301': 'วิทยาศาสตร์งานไฟฟ้า อิเล็กทรอนิกส์และการสื่อสาร',
    '3000-1302': 'วิทยาศาสตร์งานเครื่องกลและการผลิต',
    '3000-1303': 'วิทยาศาสตร์เทคโนโลยียาง',
    '3000-1304': 'วิทยาศาสตร์งานก่อสร้างและตกแต่งภายใน',
    '3000-1309': 'วิทยาศาสตร์งานศิลปะและงานออกแบบ',
    '3000-1317': 'การวิจัยเบื้องต้น',
    '3000-1319': 'ฟิสิกส์เพื่อการเดินเรือ 1',
    '3000-1320': 'ฟิสิกส์เพื่อการเดินเรือ 2',
    '3000-1401': 'คณิตศาสตร์เพื่อพัฒนาทักษะการคิด',
    '3000-1402': 'คณิตศาสตร์อุตสาหกรรม',
    '3000-1403': 'คณิตศาสตร์ธุรกิจ',
    '3000-1404': 'คณิตศาสตร์และสถิติเพื่องานอาชีพ',
    '3000-1405': 'คณิตศาสตร์เกษตรกรรม',
    '3000-1406': 'แคลคูลัสพื้นฐาน',
    '3000-1408': 'สถิติและการวางแผนการทดลอง',
    '3000-1501': 'ชีวิตกับสังคมไทย',
    '3000-1502': 'เศรษฐกิจพอเพียง',
    '3000-1505': 'การเมืองการปกครองของไทย',
    '3000-1606': 'การคิดอย่างเป็นระบบ',
    '3000-1610': 'คุณภาพชีวิตเพื่อการทำงาน',
    '3503-2001': 'จุลชีววิทยาทั่วไป',
    'GEDLC101': 'ภาษาอังกฤษเพื่อการสื่อสาร',
    'GEDLC102': 'ภาษาอังกฤษสำหรับการทำงาน',
    'GEDLC103': 'ภาษาจีนในชีวิตประจำวัน',
    'GEDLC104': 'ภาษาญี่ปุ่นในชีวิตประจำวัน',
    'GEDLC105': 'ภาษาเกาหลีในชีวิตประจำวัน',
    'GEDLC106': 'ภาษาพม่าในชีวิตประจำวัน',
    'GEDEL201': 'การใช้ภาษาไทยเพื่ออาชีพ',
    'GEDLC202': 'การเขียนและนำเสนอรายงาน',
    'GEDSC401': 'คณิตศาสตร์และสถิติในชีวิตประจำวัน',
    'GEDSC402': 'คณิตศาสตร์ทั่วไป',
    'GEDSC403': 'หลักสถิติ',
    'GEDSC404': 'แคลคูลัส 1',
    'GEDSC405': 'แคลคูลัสและเรขาคณิตวิเคราะห์ 1',
    'GEDSC406': 'แคลคูลัสและเรขาคณิตวิเคราะห์ 2',
    'GEDSC407': 'คณิตศาสตร์พื้นฐาน',
    'GEDSO501': 'การพัฒนาทักษะชีวิตในสังคมสมัยใหม่',
    'GEDSO502': 'สังคม เศรษฐกิจ การเมือง การปกครองของไทย',
    'GEDSO604': 'กระบวนการคิดและการใช้นวัตกรรมเพื่อชีวิตมีสุข',
    'GEDSO605': 'กิจกรรมเพื่อสุขภาพ',
    'GEDSC304': 'วิทยาศาสตร์กายภาพพื้นฐานทางการเกษตร',
    'GEDSC305': 'วิทยาศาสตร์งานไฟฟ้าและอิเล็กทรอนิกส์',
    'GEDSC303': 'วิทยาศาสตร์ความหลากหลายทางชีวภาพ',
    '01320101': 'ภาษาอังกฤษ 1',
    '01320102': 'ภาษาอังกฤษ 2',
    '01320103': 'ภาษาอังกฤษพื้นฐาน 1',
    '01320104': 'ภาษาอังกฤษพื้นฐาน 2',
    '01320105': 'ภาษาอังกฤษเพื่องานอาชีพ',
    '01340101': 'ภาษาจีนพื้นฐาน 1',
    '01340102': 'ภาษาจีนพื้นฐาน 2',
    '01330101': 'ภาษาญี่ปุ่นพื้นฐาน 1',
    '01330102': 'ภาษาญี่ปุ่นพื้นฐาน 2',
    '01370101': 'ภาษาเกาหลี 1',
    '01370102': 'ภาษาเกาหลี 2',
    '01310101': 'ภาษาไทย 1',
    '01310102': 'ภาษาไทย 2',
    '01210001': 'การเขียนรายงานและการใช้ห้องสมุด',
    '13010120': 'คณิตศาสตร์ทั่วไป',
    '13121110': 'หลักสถิติ',
    '13121140': 'สถิติ 1',
    '05000105': 'สถิติธุรกิจ',
    '01120001': 'การพัฒนาคุณภาพชีวิตและสังคม',
    '13086132': 'ฟิสิกส์ประยุกต์ 2',
    '13080141': 'ฟิสิกส์ 1',
    '13081141': 'กลศาสตร์ประยุกต์',
    '13080040': 'ฟิสิกส์ทั่วไป',
    '13011132': 'แคลคูลัสและเรขาคณิตวิเคราะห์ 1',
    '13011133': 'แคลคูลัสและเรขาคณิตวิเคราะห์ 2',
    '13010110': 'คณิตศาสตร์พื้นฐาน',
    '13020111': 'เคมีทั่วไป',
    '13022101': 'เคมีอินทรีย์',
    '13041101': 'ชีววิทยาทั่วไป',
    '13041264': 'จุลชีววิทยาทั่วไป'
  };

  function normalizeCode(rawCode) {
    let c = String(rawCode || '').trim().toUpperCase();
    c = c.replace(/[\s_]+/g, '');
    
    // Fix common OCR substitutions:
    c = c.replace(/^(GEBLC|GEBSC|GEBSO|GEBHT|GEBIN|GEDLC|GEDSC|GEDSO|GEDEL|FUNSC|FUNMA)[LI|](\d{2})/i, '$11$2');
    c = c.replace(/^(GEBLC|GEBSC|GEBSO|GEBHT|GEBIN|GEDLC|GEDSC|GEDSO|GEDEL|FUNSC|FUNMA)(\d)[LI|](\d)/i, '$1$20$3');
    c = c.replace(/^(GEBLC|GEBSC|GEBSO|GEBHT|GEBIN|GEDLC|GEDSC|GEDSO|GEDEL|FUNSC|FUNMA)(\d{2})[OQ]/i, '$1$20');
    c = c.replace(/^(GEBLC|GEBSC|GEBSO|GEBHT|GEBIN|GEDLC|GEDSC|GEDSO|GEDEL|FUNSC|FUNMA)(\d{2})Z/i, '$1$22');
    c = c.replace(/^BEH5L/i, 'GEBSC');
    c = c.replace(/^GEB5O/i, 'GEBSO');
    c = c.replace(/^GEB5U/i, 'GEBSO');
    c = c.replace(/^GE85O/i, 'GEBSO');
    c = c.replace(/^GE850/i, 'GEBSO');
    c = c.replace(/^GEBHI/i, 'GEBHT');
    c = c.replace(/^GEBLN/i, 'GEBIN');
    c = c.replace(/^GEB[|I]N/i, 'GEBIN');
    c = c.replace(/^GEBINT/i, 'GEBIN7');
    c = c.replace(/^Gtu50/i, 'GEDSO');
    c = c.replace(/^GTU50/i, 'GEDSO');
    c = c.replace(/^UNSC11/i, 'FUNSC11');
    c = c.replace(/^NSC30/i, 'FUNSC30');
    c = c.replace(/^UNSC10/i, 'FUNSC10');

    // Fix source code OCR errors
    c = c.replace(/^30000[I|L](\d{4})$/, '30000-1$1');
    c = c.replace(/^3000[I|L](\d{4})$/, '3000-1$1');
    c = c.replace(/^30000-(\d{3})$/, '30000-1$1');
    c = c.replace(/^3000-(\d{3})$/, '3000-1$1');
    c = c.replace(/^30OOO-/i, '30000-');
    c = c.replace(/^30OO-/i, '3000-');
    c = c.replace(/^3OOO-/i, '3000-');
    c = c.replace(/^3OOOO-/i, '30000-');
    c = c.replace(/^30000-16\s*1O$/i, '30000-1610');
    c = c.replace(/^3OO0-16\s*1O$/i, '3000-1610');
    c = c.replace(/^3000-16\s*1O$/i, '3000-1610');
    c = c.replace(/^3000-16\s*10$/i, '3000-1610');
    c = c.replace(/^0132010[LI|]/i, '01320101');
    c = c.replace(/^1301012[OQ]/i, '13010120');
    c = c.replace(/^1302011[I|L7]/i, '13020111');

    if (KNOWN_TARGET_COURSES[c]) return c;
    if (KNOWN_SOURCE_COURSES[c]) return c;
    return c;
  }

  function resolveCourseName(code, rawName) {
    const norm = normalizeCode(code);
    if (KNOWN_TARGET_COURSES[norm]) {
      return KNOWN_TARGET_COURSES[norm].name;
    }
    if (KNOWN_SOURCE_COURSES[norm]) {
      return KNOWN_SOURCE_COURSES[norm];
    }
    const clean = sanitizeCourseName(rawName);
    const hasThai = /[\u0E00-\u0E7F]/.test(clean);
    if (!hasThai) {
      return norm;
    }
    return clean || norm;
  }

  function cleanText(str) {
    return String(str || '').replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
  }

  function sanitizeCourseName(name) {
    return String(name || '')
      .replace(/\b\d+\(\d+-\d+-\d+\)|\b\d+-\d+-\d+\b|\b\d+\(\d+-\d+\)/g, '')
      .replace(/\(\s*\)/g, '')
      .replace(/(?:^|\s+)(?:หรือ|และ|xia|xio|uia|lia|เทียบได้)(?:\s+|$)/gi, ' ')
      .replace(/[*•\-]+/g, ' ')
      .replace(/[{}[\]\\":,]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  const STRICT_SOURCE_RE = /\b(\d{5}-\d{4}|\d{4}-\d{4}|0\d{7}|1\d{7}|05\d{6}|GED[A-Z0-9]{2}\d{3})\b/gi;

  function extractSourceCourses(text) {
    let clean = cleanText(text);
    if (!clean || clean === '-' || clean === 'ไม่มี' || /^เทียบได้$/.test(clean)) {
      return [];
    }

    clean = clean
      .replace(/([A-Z]{3,8})\s+([0-9LI|OZ]{2,4})/gi, '$1$2')
      .replace(/(3\d{3,4})\s*-\s*(\d{4})/g, '$1-$2')
      .replace(/(3\d{3,4})-(\d)\s*(\d{3})/g, '$1-$2$3')
      .replace(/30OOO-/gi, '30000-')
      .replace(/30OO-/gi, '3000-')
      .replace(/3OO0-16\s*1O/gi, '3000-1610')
      .replace(/30000-\s*1602/gi, '30000-1602')
      .replace(/0132010\s*([1-9])/g, '0132010$1')
      .replace(/013201\s*\.\s*02/g, '01320102')
      .replace(/1320\s*103/g, '01320103');

    const matches = [...clean.matchAll(STRICT_SOURCE_RE)];
    if (!matches.length) return [];

    const results = [];
    for (let i = 0; i < matches.length; i++) {
      const match = matches[i];
      const rawCode = match[1];
      const code = normalizeCode(rawCode);
      if (!isValidSourceCode(code)) continue;

      const startIndex = match.index + match[0].length;
      const nextIndex = (i + 1 < matches.length) ? matches[i + 1].index : clean.length;

      const betweenText = clean.substring(startIndex, nextIndex);
      const surrounding = clean.substring(Math.max(0, match.index - 20), Math.min(clean.length, nextIndex + 10));

      let condition = 'single';
      if (/(?:หรือ|xia|xio|uia|lia|\bor\b)/i.test(surrounding)) {
        condition = 'or';
      } else if (/(?:และ|\band\b)/i.test(surrounding)) {
        condition = 'and';
      }

      const name = resolveCourseName(code, betweenText);
      results.push({
        sourceCode: code,
        sourceName: name,
        condition
      });
    }

    return results;
  }

  function isValidTargetCode(code) {
    const c = normalizeCode(code);
    if (!c || /^\d{4}$/.test(c)) return false; // ignore 4-digit years like 2564
    if (KNOWN_TARGET_COURSES[c]) return true;
    if (/^[A-Z]{2,8}\d{2,4}$/i.test(c)) return true;
    if (/^\d{8}$/.test(c)) return true;
    return false;
  }

  function isValidSourceCode(code) {
    const c = normalizeCode(code);
    if (!c) return false;
    if (KNOWN_SOURCE_COURSES[c]) return true;
    if (/^\d{5}-\d{4}$/.test(c)) return true;
    if (/^\d{4}-\d{4}$/.test(c)) return true;
    if (/^(GEDLC|GEDSC|GEDSO|GEDEL|[A-Z]{2,6})\d{3,4}$/i.test(c)) return true;
    if (/^\d{8}$/.test(c)) return true;
    return false;
  }

  function extractCredits(text, targetCode = '') {
    const norm = normalizeCode(targetCode);
    if (KNOWN_TARGET_COURSES[norm]?.credits) {
      return KNOWN_TARGET_COURSES[norm].credits;
    }
    const match = String(text || '').match(/\b(\d(?:\.\d)?)(?:\s*\([^)]*\)|-\d+-\d+)?\b/);
    if (match) {
      const num = Number(match[1]);
      if (num > 0 && num <= 30 && num * 2 % 1 === 0) return num;
    }
    return 3;
  }

  function parsePdfItemsToTable(items, options = {}) {
    if (!Array.isArray(items) || !items.length) return [];

    const cleanItems = items.map(item => {
      let x = item.x, y = item.y;
      if (Array.isArray(item.transform)) {
        x = item.transform[4];
        y = item.transform[5];
      }
      return {
        str: cleanText(item.str),
        x: Number(x) || 0,
        y: Number(y) || 0,
        w: Number(item.width) || 0,
        h: Number(item.height) || 0
      };
    }).filter(item => item.str.length > 0);

    if (!cleanItems.length) return [];

    // Sort by Y descending, then X ascending
    cleanItems.sort((a, b) => (b.y - a.y) || (a.x - b.x));

    const lines = [];
    let currentLine = [];
    let currentY = null;

    for (const item of cleanItems) {
      if (/^(ข้อมูล\s*ณ\s*วันที่|หน้า\s*\d+|\d+\s*$)/.test(item.str)) continue;

      if (currentY === null || Math.abs(item.y - currentY) <= 6) {
        currentLine.push(item);
        currentY = currentY === null ? item.y : (currentY * 0.7 + item.y * 0.3);
      } else {
        currentLine.sort((a, b) => a.x - b.x);
        lines.push({ y: currentY, items: currentLine });
        currentLine = [item];
        currentY = item.y;
      }
    }
    if (currentLine.length) {
      currentLine.sort((a, b) => a.x - b.x);
      lines.push({ y: currentY, items: currentLine });
    }

    const minX = Math.min(...cleanItems.map(i => i.x));
    const maxX = Math.max(...cleanItems.map(i => i.x));
    const tableWidth = maxX - minX;
    const leftColThreshold = minX + Math.max(100, tableWidth * (options.leftColRatio || 0.22));

    const rows = [];
    let currentRow = null;

    for (const line of lines) {
      const leftItems = line.items.filter(i => i.x < leftColThreshold);
      const rightItems = line.items.filter(i => i.x >= leftColThreshold);

      let leftText = leftItems.map(i => i.str).join(' ');
      const rightText = rightItems.map(i => i.str).join(' ');

      // Normalize space-split target codes in leftText
      leftText = leftText
        .replace(/([A-Z]{3,8})\s+([0-9LI|OZ]{2,4})/gi, '$1$2')
        .replace(/(GEBLC|GEBSC|GEBSO|GEBHT|GEBIN|FUNSC|FUNMA)\s*(\d)\s*([0-9LI|OZ]{2})/gi, '$1$2$3')
        .replace(/(GEBLC|GEBSC|GEBSO|GEBHT|GEBIN|FUNSC|FUNMA)\s*(\d{2})\s*([0-9LI|OZ])/gi, '$1$2$3');

      let foundTargetCode = null;
      for (const w of leftText.split(/\s+/)) {
        const norm = normalizeCode(w);
        if (isValidTargetCode(norm)) {
          foundTargetCode = norm;
          break;
        }
      }

      if (foundTargetCode) {
        if (currentRow) rows.push(currentRow);

        const targetCode = foundTargetCode;
        const targetName = resolveCourseName(targetCode, leftText);
        const targetCredits = extractCredits(leftText, targetCode);

        currentRow = {
          targetCode,
          targetName: targetName || targetCode,
          targetCredits,
          rightTexts: rightText ? [rightText] : []
        };
      } else if (currentRow) {
        if (leftText && (!currentRow.targetName || currentRow.targetName === currentRow.targetCode)) {
          currentRow.targetName = resolveCourseName(currentRow.targetCode, leftText);
        }
        if (rightText) {
          currentRow.rightTexts.push(rightText);
        }
      }
    }
    if (currentRow) rows.push(currentRow);

    const mappings = [];
    const seenPair = new Set();

    for (const row of rows) {
      const combinedRightText = row.rightTexts.join(' \n ');
      const sources = extractSourceCourses(combinedRightText);

      for (const src of sources) {
        if (src.sourceCode === row.targetCode) continue;
        if (!isValidSourceCode(src.sourceCode) || !isValidTargetCode(row.targetCode)) continue;

        const pairKey = `${src.sourceCode}:${row.targetCode}`;
        if (!seenPair.has(pairKey)) {
          seenPair.add(pairKey);
          mappings.push({
            targetCode: row.targetCode,
            targetName: resolveCourseName(row.targetCode, row.targetName),
            targetCredits: row.targetCredits || 3,
            sourceCode: src.sourceCode,
            sourceName: resolveCourseName(src.sourceCode, src.sourceName),
            condition: src.condition
          });
        }
      }
    }

    return mappings;
  }


  function parseMappingText(rawText) {
    const lines = String(rawText || '').split(/\r?\n/).map(l => cleanText(l)).filter(Boolean);
    const rows = [];
    let currentTarget = null;

    for (const line of lines) {
      if (/^\d+\.\s+กลุ่มวิชา/i.test(line) || /^รายวิชา/i.test(line) || /^หลักสูตร/i.test(line) || /^ตารางเทียบโอน/i.test(line)) {
        continue;
      }

      const targetMatch = line.match(/^([A-Z]{2,8}[\dLI|OZ]{2,4}|\d{6,8})\s+(.+?)(?:\s+(\d+(?:\([^)]*\)|-\d+-\d+)?))?$/i);
      if (targetMatch && isValidTargetCode(targetMatch[1])) {
        const targetCode = normalizeCode(targetMatch[1]);
        const targetName = resolveCourseName(targetCode, targetMatch[2]);
        const targetCredits = extractCredits(targetMatch[3] || line, targetCode);
        currentTarget = {
          targetCode,
          targetName,
          targetCredits,
          sources: []
        };
        rows.push(currentTarget);
        continue;
      }

      if (currentTarget) {
        const sources = extractSourceCourses(line);
        for (const src of sources) {
          currentTarget.sources.push(src);
        }
      }
    }

    const mappings = [];
    const seenPair = new Set();
    for (const r of rows) {
      for (const src of r.sources) {
        if (src.sourceCode === r.targetCode) continue;
        if (!isValidSourceCode(src.sourceCode) || !isValidTargetCode(r.targetCode)) continue;

        const pairKey = `${src.sourceCode}:${r.targetCode}`;
        if (!seenPair.has(pairKey)) {
          seenPair.add(pairKey);
          mappings.push({
            targetCode: r.targetCode,
            targetName: resolveCourseName(r.targetCode, r.targetName),
            targetCredits: r.targetCredits || 3,
            sourceCode: src.sourceCode,
            sourceName: resolveCourseName(src.sourceCode, src.sourceName),
            condition: src.condition
          });
        }
      }
    }

    return mappings;
  }

  function matchMappingsWithCatalog(extractedMappings, targetYear, catalog) {
    const yearStr = String(targetYear || '').trim();
    const existingCourses = (catalog?.courses || []).filter(c => String(c.year) === yearStr);
    const existingMappings = (catalog?.mappings || []).filter(m => String(m.year) === yearStr);

    const courseMap = new Map();
    for (const c of existingCourses) {
      courseMap.set(normalizeCode(c.code), c);
    }

    const existingSourceMap = new Map();
    for (const m of existingMappings) {
      existingSourceMap.set(normalizeCode(m.source_code), m);
    }

    const valid = [];
    const unmatched = [];
    const coursesToCreateMap = new Map();
    const seenSources = new Set();
    let duplicateCount = 0;
    let updateCount = 0;
    let newCount = 0;

    for (const item of extractedMappings) {
      const sourceCode = normalizeCode(item.sourceCode);
      const targetCode = normalizeCode(item.targetCode);

      if (!sourceCode || !targetCode || !isValidTargetCode(targetCode) || !isValidSourceCode(sourceCode)) continue;

      if (seenSources.has(sourceCode)) {
        duplicateCount++;
        continue;
      }
      seenSources.add(sourceCode);

      const isExisting = existingSourceMap.has(sourceCode);
      let targetCourse = courseMap.get(targetCode);

      // If target course doesn't exist yet in this curriculum year, auto-create it with official Thai name
      if (!targetCourse) {
        if (!coursesToCreateMap.has(targetCode)) {
          const officialName = resolveCourseName(targetCode, item.targetName);
          const credits = KNOWN_TARGET_COURSES[targetCode]?.credits || Number(item.targetCredits) || 3;
          const newCourse = {
            year: yearStr,
            code: targetCode,
            name: officialName,
            credits
          };
          coursesToCreateMap.set(targetCode, newCourse);
        }
        targetCourse = coursesToCreateMap.get(targetCode);
      }

      if (isExisting) updateCount++; else newCount++;
      valid.push({
        year: yearStr,
        sourceCode,
        sourceName: resolveCourseName(sourceCode, item.sourceName),
        targetCode,
        targetName: targetCourse.name || resolveCourseName(targetCode, item.targetName),
        targetCredits: targetCourse.credits || extractCredits('', targetCode),
        condition: item.condition || 'single',
        status: isExisting ? 'update' : 'new'
      });
    }

    const coursesToCreate = Array.from(coursesToCreateMap.values());

    return {
      year: yearStr,
      totalExtracted: extractedMappings.length,
      valid,
      coursesToCreate,
      unmatched,
      newCount,
      updateCount,
      duplicateCount
    };
  }


  const moduleExports = {
    cleanText,
    sanitizeCourseName,
    extractSourceCourses,
    parsePdfItemsToTable,
    parseMappingText,
    matchMappingsWithCatalog
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = moduleExports;
  } else {
    root.PdfMappingParser = moduleExports;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
