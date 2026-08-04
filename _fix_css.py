import pathlib

p = pathlib.Path('src/styles/resume.css')
s = p.read_text(encoding='utf-8')

first_style_c = '''/* ========================
   STYLE C — 思源宋体
   ======================== */
#resume-page[data-theme="c"] {
  --page-padding-top: 6mm; --page-padding-bottom: 6mm;
  --page-padding-left: 12mm; --page-padding-right: 12mm;
  --section-gap: 0.8mm; --entry-gap: 0.5mm; --bullet-gap: 0.1mm;
  --font-size-body: 9pt; --font-size-small: 8.5pt; --font-size-name: 17pt;
  --font-size-section-title: 10.5pt; --font-size-entry-name: 9.5pt; --font-size-contact: 9pt;
  --color-text: #1a1a1a; --color-muted: #555; --color-divider: #1a1a1a; --photo-w: 24mm; --photo-h: 34mm;
}
#resume-page[data-theme="c"] #resume-content {
  padding: var(--page-padding-top) var(--page-padding-right) var(--page-padding-bottom) var(--page-padding-left);
  font-size: var(--font-size-body); line-height: 1.45; color: var(--color-text);
  font-family: "Source Han Serif VF", "思源宋体 VF", "Noto Serif CJK SC", "SimSun", serif;
  font-weight: 500;
  text-align: justify; text-justify: inter-ideograph;
}
#resume-page[data-theme="c"] #resume-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 5mm;
  padding-bottom: 0;
  border-bottom: none;
}
#resume-page[data-theme="c"] #header-info {
  flex: 1; display: flex; flex-direction: column; align-items: center;
  text-align: center; padding-top: 2mm;
}
#resume-page[data-theme="c"] #profile-name {
  display: block; font-size: var(--font-size-name); font-weight: 700; color: var(--color-text);
  margin: 0 0 2.5mm; letter-spacing: 6px; line-height: 1.2;
  font-family: "Source Han Sans VF", "思源黑体 VF", "PingFang SC", "Microsoft YaHei", sans-serif;
}
#resume-page[data-theme="c"] #profile-headline { display: none; }
#resume-page[data-theme="c"] #contact-info {
  display: flex; flex-wrap: wrap; justify-content: center; gap: 0;
  font-size: var(--font-size-contact); color: var(--color-text);
}
#resume-page[data-theme="c"] .contact-item { white-space: nowrap; }
#resume-page[data-theme="c"] .contact-item + .contact-item::before { content: " ｜ "; color: var(--color-muted); }
#resume-page[data-theme="c"] #photo-container {
  width: var(--photo-w); height: var(--photo-h);
  flex-shrink: 0; overflow: hidden; position: relative;
  margin-left: 5mm; border: none; border-radius: 2px;
}
#resume-page[data-theme="c"] #photo-container[data-empty="true"] { border: 1px dashed #ccc; }
#resume-page[data-theme="c"] #photo-container[data-empty="true"]::after {
  content: "照片"; position: absolute; inset: 0; display: flex;
  align-items: center; justify-content: center; font-size: 8pt; color: #bbb;
}
#resume-page[data-theme="c"] #photo-container img {
  position: absolute; transform-origin: center; user-select: none; pointer-events: none; object-fit: cover;
}
#resume-page[data-theme="c"] .resume-section { margin-bottom: var(--section-gap); }
#resume-page[data-theme="c"] .section-title {
  font-size: 11pt; font-weight: 900; font-synthesis: weight; color: var(--color-text);
  margin: 0 0 1.5mm; padding-bottom: 1mm; background: none; border-radius: 0;
  border-bottom: 1px solid var(--color-divider); display: block; letter-spacing: 1px;
  font-family: "Source Han Sans VF", "思源黑体 VF", "PingFang SC", "Microsoft YaHei", sans-serif;
}
#resume-page[data-theme="c"] .section-divider { display: none; }
#resume-page[data-theme="c"] .resume-entry { margin-bottom: var(--entry-gap); }
#resume-page[data-theme="c"] .entry-header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 0.8mm; }
#resume-page[data-theme="c"] .entry-left { display: flex; align-items: baseline; flex: 1; }
#resume-page[data-theme="c"] .entry-name { font-size: var(--font-size-entry-name); font-weight: 700; color: var(--color-text); }
#resume-page[data-theme="c"] .entry-role:not(:empty)::before { content: " ｜ "; font-weight: 400; color: var(--color-muted); }
#resume-page[data-theme="c"] .entry-role { font-size: var(--font-size-entry-name); font-weight: 700; color: var(--color-text); }
#resume-page[data-theme="c"] .entry-date-location {
  font-size: var(--font-size-small); color: var(--color-text); text-align: right;
  white-space: nowrap; font-weight: 400; flex-shrink: 0; margin-left: 4mm;
}
#resume-page[data-theme="c"] .entry-location { display: none; }
#resume-page[data-theme="c"] .entry-bullets, #resume-page[data-theme="c"] .skills-list { list-style: none; padding: 0; margin: 0; }
#resume-page[data-theme="c"] .entry-bullets .bullet-item, #resume-page[data-theme="c"] .skills-list .bullet-item {
  position: relative; padding-left: 5mm; font-size: var(--font-size-body);
  line-height: 1.65; color: var(--color-text); margin-bottom: var(--bullet-gap);
}
#resume-page[data-theme="c"] .entry-bullets .bullet-item::before,
#resume-page[data-theme="c"] .skills-list .bullet-item::before {
  content: "●"; position: absolute; left: 0.5mm; font-size: 6pt; color: var(--color-text); top: 2px;
}

'''

marker = '/* ========================\n   STYLE C — 经典衬线学术风'
if marker in s:
    s = s.replace(marker, first_style_c + marker)
    p.write_text(s, encoding='utf-8')
    print('Inserted first Style C block (思源宋体) before second Style C block.')
else:
    print('ERROR: marker not found!')

print('=== Final counts ===')
print('--photo-w:', s.count('--photo-w'))
print('--photo-h:', s.count('--photo-h'))
print('--photo-size remaining:', s.count('--photo-size'))
print('object-fit: cover:', s.count('object-fit: cover'))
print('width: var(--photo-w):', s.count('width: var(--photo-w)'))
