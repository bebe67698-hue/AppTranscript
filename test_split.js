const text = `30000-1201 ภาษาอังกฤษสำหรับงานอาชีพ 4 0 l 22567[31910-1002 l ธุรกิจดิจิทัล 4.0
1/2567 30000-1101 ทักษะ 2 3.0
2/2567 30000-1206 อังกฤษ 1 4.0
IT201 System Analysis 3 I`;
const splitText = text.replace(/(.)\s*(\b[12S]\/\d{4}\s+|\[?(?<!\d)\d{4,5}[-.\s]\d{4}(?!\d)|(?<![a-zA-Z])[A-Za-z]{2,8}\d{3,4}(?!\d))/g, (match, p1, p2) => {
  if (p1 === '\n' || p1 === '\r') return match;
  return p1 + '\n' + p2;
});
console.log(splitText);
