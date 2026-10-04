// P2.12 — a tiny, deterministic, SYNTHETIC one-page PDF for automated tests and the Studio readiness report.
// It contains no textbook material (only an ASCII test sentence); no copyrighted excerpt is ever used as a fixture.
// The options build structurally valid NEGATIVE fixtures (correct offsets, real cross-reference table) so a test can
// prove that the Studio refuses them for the right reason: `catalogExtra` adds entries to the catalog dictionary,
// `extraObjects` appends objects. None of them is ever opened, rendered or executed by any test.
export function syntheticPdf(text='KimyoLab synthetic test PDF - not a textbook excerpt.',opts:{catalogExtra?:string;extraObjects?:string[]}={}):Uint8Array{
  const safe=text.replace(/[\\()]/g,'').replace(/[^\x20-\x7e]/g,'?');
  const stream=`BT /F1 12 Tf 72 720 Td (${safe}) Tj ET`;
  const objects=[
    `<< /Type /Catalog /Pages 2 0 R${opts.catalogExtra?` ${opts.catalogExtra}`:''} >>`,
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    ...(opts.extraObjects??[]),
  ];
  let out='%PDF-1.4\n'; const offsets:number[]=[];
  objects.forEach((o,i)=>{ offsets.push(out.length); out+=`${i+1} 0 obj\n${o}\nendobj\n`; });
  const xref=out.length;
  out+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n${offsets.map(n=>`${String(n).padStart(10,'0')} 00000 n \n`).join('')}`;
  out+=`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(out);
}
