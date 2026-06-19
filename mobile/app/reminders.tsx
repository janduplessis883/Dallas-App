import { HoldingPage } from '../src/components/HoldingPage';

export default function RemindersScreen() {
  return (
    <HoldingPage
      eyebrow="Reminders"
      title="Recovery prompts"
      description="This area will control notification preferences, reminder schedules, and accountability prompts."
      nextItems={[
        'Set daily reminder windows',
        'Configure push notification preferences',
        'Preview reminder message types',
      ]}
    />
  );
}
