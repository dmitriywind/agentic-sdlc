# Source: src/forge/flow.ts "nextAction", "signalOfHead", "queue"; references/architecture.md section 3.2 "queue"
@cli:forge
Feature: forge queue gives every open CR its one next action
  `forge queue` owns the CR decisions the skills only obey. For each open CR it names the one action the process must
  take: escalate, rework, review, sync, land or wait. The first rule that matches wins, in that order. Only comments
  by the binding's bots and owners count; a stranger's verdict or note is ignored. A check named by
  forge.review_check_name or human-approval never counts as red, pending or missing here.

  Rule: escalate when rework has reached its cap or a required check is stuck

    Scenario Outline: The cap is reached, or a required check stalls past stall_minutes after the push
      When the next action is decided for the CR "<cr>" with the checks "<checks>" and the comments "<comments>"
      Then the next action is "escalate"
      And the reason is "<reason>"

      Examples:
        | rule                         | cr                             | checks     | comments                                                                                                   | reason                                          |
        | rework cap, 3 by default     | ready                          |            | bot: fail for h0, 30m ago; bot: fail for h1, 20m ago; bot: note, 10m ago saying red gate                  | rework cap                                      |
        | a required check is missing  | ready, pushed 120 minutes ago  |            |                                                                                                            | required check ci is missing past stall_minutes |
        | a required check is pending  | ready, pushed 120 minutes ago  | ci=pending | fo: comment, 5m ago saying looking                                                                         | required check ci is pending past stall_minutes |
        | a stalled CR with a pass too | ready, pushed 120 minutes ago  |            | bot: pass for h1, 120m ago                                                                                 | required check ci is missing past stall_minutes |

    Scenario: cycle.max_rework lowers the cap
      Given the cycle sets "max_rework" to 1
      When the next action is decided for the CR "ready" with the checks "" and the comments "bot: fail for h1, 1m ago"
      Then the next action is "escalate"
      And the reason is "rework cap"

  Rule: rework when the head has a fail verdict or a required check is red

    Scenario Outline: A trusted fail verdict for the head, or a red required check
      When the next action is decided for the CR "<cr>" with the checks "<checks>" and the comments "<comments>"
      Then the next action is "rework"
      And the reason is "<reason>"

      Examples:
        | rule                                 | cr    | checks     | comments                                                                  | reason                               |
        | a fail verdict for the head          | ready |            | bot: fail for h1, 1m ago                                                  | the review asks for remediation      |
        | the newest report for the head fails | ready |            | bot: pass for h1, 9m ago; bot: fail for h1, 2m ago                        | the review asks for remediation      |
        | below the cap                        | ready |            | bot: fail for h0, 30m ago; bot: fail for h1, 20m ago                      | the review asks for remediation      |
        | a red required check                 | ready | ci=failure |                                                                           | required check ci is red             |
        | a red check, a draft with a verdict  | draft | ci=failure | bot: pass for h1, 1m ago                                                  | required check ci is red             |
        | a red check, a draft, no verdict     | draft | ci=failure |                                                                           | required check ci is red             |
        | a stranger's notes do not count      | ready | ci=failure | mallory: note, 1m ago; mallory: note, 1m ago; mallory: note, 1m ago      | required check ci is red             |

    Scenario Outline: A Signal an open ticket names makes the CR wait instead
      Given every Signal a note names is open
      When the next action is decided for the CR "ready" with the checks "ci=failure" and the comments "<comments>"
      Then the next action is "wait"
      And the reason is "a Signal named by the note is open"

      Examples:
        | rule                                | comments                                                                                       |
        | the newest note for the head        | bot: note for h1, 1m ago saying flake, Signal 31                                               |
        | even at the rework cap              | bot: note for h1, 1m ago saying Signal #7; bot: fail for h0, 30m ago; bot: fail for h1, 20m ago |

  Rule: review when no trusted verdict covers the head

    Scenario Outline: A draft, or a ready CR whose head changed, has no verdict yet
      When the next action is decided for the CR "<cr>" with the checks "<checks>" and the comments "<comments>"
      Then the next action is "review"
      And the reason is "no verdict for this head"

      Examples:
        | rule                                          | cr               | checks        | comments                                 |
        | a draft, nothing yet                          | draft            |               |                                          |
        | a draft, checks green                         | draft            | ci=success    |                                          |
        | a draft, ci still pending                     | draft            | ci=pending    |                                          |
        | a draft, only the review check pending        | draft            | review=pending |                                         |
        | a draft, a verdict for an old head only       | draft            |               | bot: pass for old, 1m ago                |
        | a draft, an untrusted verdict                 | draft            |               | mallory: pass for h1, 1m ago             |
        | a ready CR whose head changed                 | ready            |               | bot: pass for old, 1m ago                |
        | a ready CR, nothing red                       | ready            |               |                                          |
        | a verdict with conflicting lines              | ready            |               | bot: conflict, 1m ago                    |
        | behind the trunk, no verdict: review first    | ready, behind    |               |                                          |
        | no push time: the stall clock has not started | ready, not pushed |              |                                          |

  Rule: sync when a ready CR is behind the trunk

    Scenario: A ready CR that passed and is behind the trunk is synced
      When the next action is decided for the CR "ready, behind" with the checks "" and the comments "bot: pass for h1, 1m ago"
      Then the next action is "sync"
      And the reason is "behind the trunk"

  Rule: land when the head passed and the CR is open and ready

    Scenario Outline: A pass verdict for the head lands the CR
      When the next action is decided for the CR "<cr>" with the checks "<checks>" and the comments "<comments>"
      Then the next action is "land"
      And the reason is "the review passed this head"

      Examples:
        | rule                                            | cr                            | checks                                                      | comments                                                                           |
        | a pass for the head                             | ready                         |                                                             | bot: pass for h1, 1m ago                                                           |
        | the newest report for the head wins             | ready                         |                                                             | bot: fail for h1, 9m ago; bot: pass for h1, 2m ago                                 |
        | a red review context is not a rework            | ready                         | review=failure                                              | bot: pass for h1, 1m ago                                                           |
        | review and human-approval never stall           | ready, pushed 120 minutes ago | ci=success, human-approval=pending, review=pending          | bot: pass for h1, 1m ago                                                           |
        | at the cap, a pass for the head still lands     | ready                         |                                                             | bot: fail for a, 30m ago; bot: fail for b, 20m ago; bot: fail for c, 10m ago; bot: pass for h1, 1m ago |

  Rule: wait on anything else

    Scenario Outline: A CR with nothing to do yet
      When the next action is decided for the CR "<cr>" with the checks "" and the comments "bot: pass for h1, 1m ago"
      Then the next action is "wait"
      And the reason is "waiting on checks or approval"

      Examples:
        | rule                                    | cr            |
        | behind the trunk, still a draft         | draft, behind |
        | passed, the CR is still a draft         | draft         |
        | a merged CR is not landed again         | merged        |

  Rule: A note names the Signal that explains a red check

    Scenario Outline: The newest trusted note for the head names the Signal, or none does
      When the Signal of the head is read from the comments "<comments>"
      Then the Signal named for the head is "<signal>"

      Examples:
        | comments                                                                           | signal  | why                           |
        | bot: note for h1, 1m ago saying flaky, Signal #31 filed                            | 31      | Signal #<id>                  |
        | bot: note for h1, 1m ago saying Signal: PROJ-4                                     | PROJ-4  | Signal: <id>                  |
        | bot: note for h1, 9m ago saying Signal 5; bot: note for h1, 1m ago saying fixed in the diff | none | the newest note decides  |
        | bot: note for h0, 1m ago saying Signal 5                                           | none    | a note for another head       |
        | mallory: note for h1, 1m ago saying Signal 5                                       | none    | a stranger                    |
        | bot: note for h1, 1m ago saying the signal is red                                  | none    | no Signal id                  |

  Rule: A row counts the reworks and says since when its state holds

    Scenario: Reworks count trusted fail verdicts and notes, since is the later of the push and the last trusted comment
      When the next action is decided for the CR "ready, pushed 50 minutes ago" with the checks "" and the comments "bot: fail for a, 40m ago; bot: note, 30m ago; mallory: note, 1m ago"
      Then the CR has been reworked 2 times
      And the state of the CR began 30 minutes ago

  Rule: The queue has one row per open CR

    Scenario: Each row names the ticket, the class, the action, the reworks and since when
      Given these CRs are open:
        | n | cr                         | checks     | comments                                                |
        | 5 | draft                      |            |                                                         |
        | 6 | ready, behind, no ticket   |            | bot: pass for h1, 1m ago                                |
        | 7 | ready                      | ci=failure | bot: note for h1, 1m ago saying Signal 31               |
        | 8 | ready, head h8             | ci=failure | bot: note for h8, 1m ago saying Signal 32               |
      And the Signal "31" is open
      And the approval class of every CR is "product-full"
      When the queue is read
      Then the queue rows are:
        | n | ticket | class        | action | reworks | since            |
        | 5 | 12     | product-full | review | 0       | 5 minutes ago    |
        | 6 |        | product-full | sync   | 0       | 1 minutes ago    |
        | 7 | 12     | product-full | wait   | 1       | 1 minutes ago    |
        | 8 | 12     | product-full | rework | 1       | 1 minutes ago    |

    Scenario: A CR whose class cannot be decided is a guardrail
      Given these CRs are open:
        | n | cr    | checks | comments |
        | 5 | ready |        |          |
      And the approval class of a CR cannot be decided
      When the queue is read
      Then the class of the first queue row is "guardrail"
