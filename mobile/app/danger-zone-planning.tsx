import { HoldingPage } from '../src/components/HoldingPage';

export default function DangerZonePlanningScreen() {
  return (
    <HoldingPage
      eyebrow="Danger Zone Planner"
      title="Plan the high-risk window"
      description="Prepare for a predictable danger zone such as a weekend, day off, time alone, travel, or a partner being away."
      nextItems={[
        'Use one adaptable flow for any high-risk period',
        'Turn the revised planning content into a smooth guided plan',
        'Save the plan, reminders, anchors, boundaries, and follow-up reflection',
      ]}
    />
  );
}
