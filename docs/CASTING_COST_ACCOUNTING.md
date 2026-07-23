# Casting Cost Accounting

The casting workflow uses replacement costing.

Only the newest confirmed and locked casting cost is included in the project total. An older casting cost is preserved in history, but it is not added to the replacement cost.

User-facing explanation:

> We only use the newest casting cost. We do not add the old and new costs together. If you need to add the cost of every casting attempt, ask the developer to change this setup.

Do not change this to cumulative casting-attempt costing without separate business approval, data-model review, migration planning, and regression tests for locked project totals.
