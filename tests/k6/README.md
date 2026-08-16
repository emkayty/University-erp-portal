# k6 Performance Tests

Implements J1 login, J2 result reads, J3 invoice-status polling, and the general read/write NFR scenarios.

## Executable fixture lifecycle

The performance suite uses generated, isolated fixtures rather than committed placeholder credentials. The seeder creates a controlled batch of test users/students in a non-production database and generates short-lived JWTs. It refuses production execution.

```bash
pnpm --filter @uniportal/api run seed:k6-test-students -- --count 5000 --env staging
export K6_TARGET_URL=https://staging-api.university.edu.ng
export K6_BURSAR_TOKEN=<short-lived staging bursar JWT>
export K6_SCRATCH_COURSE_OFFERING_ID=<staging fixture offering>
./tests/k6/run-all.sh
```

Generated `tests/k6/fixtures/test-students.json` and `test-student-tokens.json` are local test artifacts and must never be committed.

## CI

The scheduled/manual `k6-performance` job installs the application dependencies, seeds an isolated staging fixture batch, runs all scenarios, and uploads the summary artifacts. Production is never a target for the seeder or load tests.
