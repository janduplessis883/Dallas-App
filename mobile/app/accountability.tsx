import { HoldingPage } from '../src/components/HoldingPage';

export default function AccountabilityScreen() {
  return (
    <HoldingPage
      eyebrow="Accountability"
      title="Stay connected"
      description="This area will manage accountability partners, check-ins, and shared commitments."
      nextItems={[
        'Invite accountability contacts',
        'Schedule check-ins',
        'Record completed commitments',
      ]}
    />
  );
}
