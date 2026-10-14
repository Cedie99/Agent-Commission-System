import { createFileRoute } from '@tanstack/react-router';
import { PageHeader, Placeholder } from '@/components/ui/primitives';

export const Route = createFileRoute('/_app/statements')({
  component: () => (
    <>
      <PageHeader title="Statements" description="Per-payee commission statements and the payout register." />
      <Placeholder title="Not built yet">
        TODO: statement per payee per locked run (components with explanations, deductions from ledgers), PDF export, and a payout register for Finance.
      </Placeholder>
    </>
  ),
});
