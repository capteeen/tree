const STEPS = [
  { n: '01', t: 'PLANT A ROOT', d: 'You launch a coin on pump.fun through TREE. It becomes the trunk of a new tree.', c: 'text-leaf' },
  { n: '02', t: 'IT GROWS', d: 'Half of its creator fees fill its vault. When the vault hits the launch threshold, it launches a child coin.', c: 'text-blossom' },
  { n: '03', t: 'FEES CLIMB', d: 'The other half climbs: parent 50%, grandparent 25%, and halving on up. The root catches the rest.', c: 'text-sap' },
  { n: '04', t: 'BRANCHES BRANCH', d: 'Every child does the same thing. A depth-10 coin pays nine ancestors on every trade. It never stops growing.', c: 'text-[#c89a6a]' },
];

export default function Steps() {
  return (
    <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {STEPS.map((s) => (
        <li key={s.n} className="px-box p-4">
          <div className={`font-pixel text-2xl ${s.c}`}>{s.n}</div>
          <div className="mt-3 font-pixel text-[10px] leading-relaxed">{s.t}</div>
          <p className="mt-2 text-xl leading-tight text-muted">{s.d}</p>
        </li>
      ))}
    </ol>
  );
}
