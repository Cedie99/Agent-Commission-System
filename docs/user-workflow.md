# How to compute an agent's commission

Step-by-step guide for the AS_WEEKLY flow, using the sample files in `samples/`.

## Step 1: Import the files

1. Go to **Imports** and upload the **sales** file (`samples/sales-template.xlsx`).
2. Wait until the status says **VALIDATED**.
3. Click **Commit**. The data isn't used until you commit it.
4. Do the same with the **collections** file (`samples/collections-template.xlsx`).

## Step 2: Create a compute run

1. Log in as `finance@ocs.local`.
2. Go to **Compute Runs** and click **New Run**.
3. Choose type **AS_WEEKLY** and period **2026-10-05 to 2026-10-11**.
4. Wait until the status says **DRAFT**.

## Step 3: Review the results

1. Open the run and check the commission per invoice and per agent.
2. For the samples, the total should be **₱14,600.00** (see `samples/README.md`).

## Step 4: Fix exceptions (if any)

1. Go to **Exceptions** to see what couldn't be computed.
2. To fix one, add the missing rate or price in **Rates & Pricelists**, then click **Recompute** on the run.
3. To skip one, click **Resolve** and write the reason. This doesn't recompute anything.

## Step 5: Submit

1. As Finance, click **Submit for approval**.

## Step 6: Approve

1. Log out, then log in as `ssd@ocs.local` or `vp@ocs.local`.
2. Open the run and click **Approve**, or **Return to draft** if something is wrong.
3. The person who submitted a run can't approve it.

## Step 7: Lock

1. Log in as Finance again and click **Lock**.
2. A locked run is final and can't be changed.
3. After approval, the agent (`as1@ocs.local`) can see their own commission.

Statements and the payout register aren't built yet, so for now the process ends at Lock.
