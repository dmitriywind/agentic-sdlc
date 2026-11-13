# Owner: src/gates.ts, skills/sdlc/references/gates.md, docs/forges.md. The source holds the rule; this file states the behaviour a user can observe.
# Change both in the same commit.
@gate:shipped
Feature: Gate shipped
  As the Product owner
  I want Shipped to follow the real deploys, with safe tags and rollback
  So that the board shows what runs in each environment

  # Source: src/gates.ts, "shipped"; skills/sdlc/references/gates.md
  # Proof: test/gates.test.ts "shipped: only Done tickets whose merge sha is an ancestor; a ticket of unknown ancestry waits alone"
  Scenario: Only Done tickets whose merge is in the deployed revision ship
    Given a successful deploy to an environment at a revision
    When "gate shipped <env>" runs
    Then Shipped is "On <env>" on each Done ticket whose merged CR is an ancestor of the revision
    And other tickets do not change

  # Source: src/gates.ts, "shipped" (unknown ancestry)
  # Proof: test/gates.test.ts "shipped: only Done tickets whose merge sha is an ancestor; a ticket of unknown ancestry waits alone"
  Scenario: Unknown ancestry ships nothing
    Given the VCS cannot tell if a merge is an ancestor
    When "gate shipped <env>" runs with --result success
    Then no ticket changes
    And the output says the ancestry is unknown

  # Source: src/gates.ts, "shipped" (unmatched); skills/sdlc/references/gates.md
  # Proof: test/gates.test.ts "shipped: a Done ticket with no merged CR is listed as unmatched, unless labelled release"
  Scenario: A Done ticket with no merged CR is listed as unmatched
    Given a Done ticket has no merged CR
    And the ticket has no label board.labels.release
    When "gate shipped <env>" runs
    Then the output lists the ticket as unmatched
    And Shipped does not change

  # Source: src/gates.ts, "shipped" (last environment, tag)
  # Proof: test/gates.test.ts "shipped: staging, production + tag, failures, unknown env"
  Scenario: A success in the last environment creates the release tag
    Given a Done ticket has release_version "2026.1"
    When "gate shipped" runs for the last environment with --result success
    Then the tag is vcs.tag_prefix plus "2026.1"

  # Source: src/gates.ts, "shipped" (tags first, idempotent)
  # Proof: test/gates.test.ts "shipped: an existing tag is kept and the board still moves; a tag failure leaves the board untouched"
  Scenario: A second run keeps an existing tag
    Given the release tag already exists
    When "gate shipped" runs again for the last environment
    Then the gate keeps the tag
    And Shipped is "On <last environment>" on the tickets

  # Source: src/gates.ts, "shipped" (tag failure)
  # Proof: test/gates.test.ts "shipped: an existing tag is kept and the board still moves; a tag failure leaves the board untouched"
  Scenario: A tag failure leaves the board untouched
    Given the push of the release tag is rejected
    When "gate shipped" runs for the last environment
    Then the gate fails
    And no ticket changes, so a re-run retries

  # Source: src/gates.ts, "shipped" (rollback); skills/sdlc/references/gates.md
  # Proof: test/gates.test.ts "shipped: staging, production + tag, failures, unknown env"
  Scenario: A failure in the last environment returns the tickets and opens a held Signal
    Given Done tickets with a release_version are not yet On the last environment
    When "gate shipped" runs for the last environment with --result failure
    Then Shipped is "On <environment before the last>" on those tickets
    And release_version is cleared
    And a Signal with the labels "signal:deploy" and board.labels.human opens

  # Source: src/gates.ts, "shipped" (reset only tickets in the failed revision)
  # Proof: test/gates.test.ts "shipped: a last-env failure resets only tickets whose CRs are in the failed sha"
  Scenario: Rollback resets only tickets in the failed revision
    Given one ticket merged after the failed revision and is In release for a newer version
    When "gate shipped" runs for the last environment with --result failure
    Then that ticket keeps Shipped "In release" and its release_version

  # Source: src/gates.ts, "shipped"
  # Proof: test/gates.test.ts "shipped: a deploy that beats the merge gate ships the In review ticket and moves it to Done"
  Scenario: A deploy that reports before the merge gate still ships the ticket
    Given a ticket at In review whose CR merged at an ancestor of the deployed sha
    When "gate shipped" runs for an environment with --result success
    Then the ticket moves to Done
    And Shipped is "On <environment>"

  # Source: src/gates.ts, "shipped" (rollback keyed on the version)
  # Proof: test/gates.test.ts "shipped: a last-env failure before In release is set still resets the cut tickets"
  Scenario: A failure that arrives before In release is set still resets the cut tickets
    Given a Done ticket with a release_version and Shipped "On staging"
    When "gate shipped" runs for the last environment with --result failure
    Then release_version is cleared on that ticket
    And a ticket already On the last environment keeps its release_version

  # Source: src/gates.ts, "shipped" (failure in another environment)
  # Proof: test/gates.test.ts "shipped: staging, production + tag, failures, unknown env"
  Scenario: A failure in an earlier environment opens a Signal that is not held
    When "gate shipped" runs for an environment that is not the last with --result failure
    Then a Signal with the label "signal:deploy" opens
    And the Signal has no board.labels.human label

  # Source: src/gates.ts, "shipped" (unknown environment)
  # Proof: test/gates.test.ts "shipped: staging, production + tag, failures, unknown env"
  Scenario: An unknown environment is refused
    When "gate shipped qa" runs and "qa" is not in product.environments
    Then the gate fails and lists the known environments

  # Source: src/gates.ts, "shipped" (version)
  # Proof: test/gates.test.ts "shipped: --version records the artifact version and tags it; continuous delivery has no In release"
  Scenario: A continuous deploy records its artifact version
    Given product.delivery is continuous
    And a Done ticket whose CR merged at an ancestor of the deployed sha
    When "gate shipped <last env> --result success --version 4.1.0" runs
    Then the ticket shows On <last env> and Release Version 4.1.0
    And the tag "<vcs.tag_prefix>4.1.0" exists

  # Source: src/gates.ts, "shipped" (rolled-back)
  # Proof: test/gates.test.ts "shipped: rolled-back steps back only the tickets not in the revision now running"
  Scenario: A rollback steps back only the tickets not in the running revision
    Given two tickets On production, one merged before revision R and one after
    When "gate shipped production --result rolled-back --sha R" runs
    Then the ticket merged after R shows On <environment before production>
    And it keeps its Release Version
    And the ticket merged before R stays On production
    And no Signal opens

  # Source: src/gates.ts, "mergeShas"
  # Proof: test/gates.test.ts "shipped: a forge that searches by ticket is asked per candidate ticket, not for every merged CR"
  Scenario: The gate looks up merges per candidate ticket
    Given the forge can search merged CRs by the ticket they close
    And only one Done ticket is not yet On the environment
    When "gate shipped" runs with --result success
    Then the gate asks the forge about that one ticket only

  # Source: src/gates.ts, "shipped" (read again before the write)
  # Proof: test/gates.test.ts "shipped: a slower earlier-environment deploy never lowers a newer Shipped; a re-run failure opens one Signal"
  Scenario: A slower deploy of an earlier environment never lowers Shipped
    Given a ticket that reached On production while the staging gate was running
    When the staging gate writes its result
    Then the ticket keeps On production

  # Source: src/gates.ts, "shipped" (signal)
  # Proof: test/gates.test.ts "shipped: a slower earlier-environment deploy never lowers a newer Shipped; a re-run failure opens one Signal"
  Scenario: One failed deploy opens one Signal with its environment label
    Given board.env_labels lists "env:staging"
    When "gate shipped staging --result failure" runs twice for the same sha
    Then one Signal labelled "signal:deploy" and "env:staging" is open

  # Source: src/gates.ts, "shipped" (rolled-back)
  # Proof: test/gates.test.ts "shipped: a rollback in an earlier environment leaves tickets that are further on"
  Scenario: A rollback in an earlier environment leaves tickets that are further on
    Given a ticket On production and a ticket On staging
    When "gate shipped staging --result rolled-back --sha <older>" runs
    Then only the ticket On staging steps back
