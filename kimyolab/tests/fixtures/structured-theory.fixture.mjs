// P2.3 TEST FIXTURE ONLY — never content. The text is deliberately neutral (it describes the fixture itself, not
// chemistry) so that no chemistry claim is invented even in tests. It exercises the structured theory contract.
export const FIXTURE_THEORY_ID = 'theory.9.06';
export const FIXTURE_UNIT_ID = 'lu.9.06';
export const FIXTURE_SOURCE = 'src.curriculum.9.06';
const para = 'Bu matn faqat avtomatik test uchun yozilgan namunaviy tushuntirish bo‘lib, hech qanday kimyoviy da’vo qilmaydi. U tuzilmali nazariya renderi sarlavhalar, bo‘limlar va manbalarni to‘g‘ri ko‘rsatishini tekshiradi.';
const block = (extra) => ({...extra, sourceRefs: [FIXTURE_SOURCE], authoredBy: 'fixture.author', status: 'ready-for-review', reviews: []});
export function structuredFixture(overrides = {}) {
  return {
    schema: 'kimyolab.structured-theory.v1', theoryId: FIXTURE_THEORY_ID, learningUnitId: FIXTURE_UNIT_ID, version: 'fixture-1',
    explanation: block({text: `${para}\n\n${para}`}),
    workedExamples: [block({problem: 'Test misolining sharti (faqat fixture).', solutionSteps: ['Birinchi qadam matni.', 'Ikkinchi qadam matni.'], answer: 'Test javobi matni.'})],
    misconceptions: [block({statement: 'Fixture uchun yozilgan xato fikr matni.', correction: 'Fixture uchun yozilgan to‘g‘ri izoh matni.'})],
    summary: block({points: ['Birinchi xulosa bandi.', 'Ikkinchi xulosa bandi.']}),
    ...overrides,
  };
}
