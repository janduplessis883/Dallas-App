import { HoldingPage } from '../src/components/HoldingPage';

export default function AiSupportScreen() {
  return (
    <HoldingPage
      eyebrow="AI support"
      title="Guided support"
      description="This area will provide safe, structured AI assistance for reflection, planning, and next-step support."
      nextItems={[
        'Start a check-in conversation',
        'Summarize patterns from plan activity',
        'Escalate to human support when needed',
      ]}
    />
  );
}
