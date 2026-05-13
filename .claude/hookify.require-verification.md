---
name: require-verification
enabled: true
event: stop
pattern: .*
---

Before stopping, verify the work is actually complete:

- Did you run `source ~/.zshrc && npm test` and confirm all tests pass?
- If you made UI changes, did you check them at http://localhost:8080?
- If you haven't run tests yet, do not claim the work is done — run them first.

Do not say "done", "fixed", "should work", or "complete" unless you have seen passing output with your own eyes.
