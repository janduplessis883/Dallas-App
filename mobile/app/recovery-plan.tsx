import { HoldingPage } from '../src/components/HoldingPage';

export default function RecoveryPlanScreen() {
  return (
    <HoldingPage
      eyebrow="Recovery plan"
      title="Build the plan"
      description="This area will hold the member's structured recovery plan, daily commitments, goals, and support resources."
      nextItems={[
        'Create and edit recovery goals',
        'Add triggers, coping actions, and support contacts',
        'Review progress against the active plan',
      ]}
    />
  );
}
