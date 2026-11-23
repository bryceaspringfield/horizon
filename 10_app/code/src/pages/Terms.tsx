// Horizon's Terms of Use: shown from the sign-in screen (a new account must accept them) and as a page of the app.
// Change TERMS_DATE with any change of substance; the acceptance stored on a device names the date accepted.

export const TERMS_DATE = 'November 23, 2026';
export const TERMS_KEY = 'horizon-terms';

const SECTIONS: [string, string[]][] = [
  ['1. What Horizon is', [
    'Horizon is a free, open-source calculator for exploring personal finance scenarios. It is an educational and informational tool. By creating an account or using Horizon, you agree to these terms. If you do not agree, do not use Horizon.',
  ]],
  ['2. No financial, investment, tax, or legal advice', [
    'Nothing in Horizon is financial, investment, tax, accounting, insurance, estate planning, or legal advice, and nothing in Horizon is a recommendation to buy, sell, or hold any security or to follow any strategy. This covers every number, chart, projection, optimizer result, suggestion, label, and note the app shows.',
    'Horizon\'s author is not acting as your financial adviser, investment adviser, broker, tax preparer, accountant, or attorney, and is not registered as one for the purposes of this app. Using Horizon creates no advisory, fiduciary, or professional relationship of any kind.',
    'Horizon knows only the figures you type in. It does not know your full circumstances and cannot judge whether any choice suits you. Before acting on anything you see here, consult a qualified professional who does.',
  ]],
  ['3. Projections are estimates, and they can be wrong', [
    'Every result is a hypothetical estimate built from your inputs and from simplifying assumptions about returns, inflation, taxes, benefits, and lifespans. Actual results will differ, possibly by a large amount. Monte Carlo results and historical backtests describe modeled outcomes, and they are no prediction or guarantee. Past market performance does not guarantee future results.',
    'Horizon\'s tax, benefit, and estate rules (federal and state) are simplified, may be incomplete or out of date, and may contain errors. Laws change. Horizon is no substitute for tax software, a tax return, or official guidance. Verify any figure which matters with the official source or a professional.',
    'The software may contain bugs. No result has been reviewed by a professional for your situation.',
  ]],
  ['4. Your decisions are your own', [
    'You alone are responsible for your financial decisions and for checking the information you rely on. You use Horizon at your own risk.',
  ]],
  ['5. Accounts and your data', [
    'With an account, your plans are encrypted in your browser with a key made from your password before they are stored on Horizon\'s server. The server cannot read them, and nobody can recover them if you forget your password. No password reset exists.',
    'Horizon is offered free and without any promise of availability. The service may be changed, interrupted, or ended at any time, and accounts and stored data may be removed, including accounts which are inactive or which misuse the service. Keep your own backup with the export on the Settings page.',
    'You are responsible for keeping your password secret and for activity under your account. Horizon collects no name, email address, or payment details, and it runs no advertising or analytics.',
  ]],
  ['6. Acceptable use', [
    'Do not use Horizon to break the law, to attack or overload the service, to reach another person\'s account, or to store anything other than your own Horizon plans. If you are under 18, use Horizon only with a parent or guardian\'s permission.',
  ]],
  ['7. No warranty', [
    'Horizon is provided "as is" and "as available", without warranty of any kind, express or implied, including warranties of accuracy, completeness, merchantability, fitness for a particular purpose, and non-infringement.',
  ]],
  ['8. Limit of liability', [
    'To the fullest extent the law allows, Horizon\'s author and contributors are not liable for any loss or damage arising from your use of Horizon or from your reliance on its results. This includes financial losses, investment losses, taxes, penalties, interest, missed opportunities, lost data, and any indirect or consequential damages, even where the possibility was known.',
  ]],
  ['9. The source code', [
    'Horizon\'s source code is released into the public domain (the Unlicense). Anyone may use, copy, change, share, and sell the code, for any purpose and with no conditions, and with no warranty. These terms cover the hosted app and its account service.',
  ]],
  ['10. Changes to these terms', [
    'These terms may be updated, and the date above then changes. Continuing to use Horizon after a change means you accept the updated terms.',
  ]],
];

export function Terms() {
  return (
    <div className="terms">
      <p className="muted">Last updated {TERMS_DATE}</p>
      <p><strong>In short: Horizon is a calculator for educational use. It gives no financial, investment, tax, or legal advice, its results are estimates which can be wrong, and you use it at your own risk.</strong></p>
      {SECTIONS.map(([title, paragraphs]) => (
        <section key={title}>
          <h4>{title}</h4>
          {paragraphs.map((p, i) => <p key={i}>{p}</p>)}
        </section>
      ))}
    </div>
  );
}

export function TermsPage() {
  return <section className="card"><h3>Terms of Use</h3><Terms /></section>;
}
