# Source: src/forge/flow.ts "buildReport", "verdict"; src/forge/index.ts "cli"; references/architecture.md section 3.2 "verdict"
@cli:forge
Feature: forge verdict posts the review report for the head
  `forge verdict <n> --pass|--fail --body-file <f>` stamps the verdict marker for the CR head and the one `Verdict:`
  line, and posts the report. With a review identity it also posts the review status and, on pass, the approving
  review. Without one, CI's review gate turns the report into the status. A missing review token fails with an Access
  error before anything is posted.

  Rule: The report is the marker for the head, the body, and one Verdict line last

    Scenario: A body that already carries the marker and the verdict is normalised
      When the report for the head "h1" is built as pass from:
        """
        <!-- verdict h1 -->
        all good
        Verdict: PASS
        """
      Then the report is:
        """
        <!-- verdict h1 -->
        all good

        Verdict: PASS
        """

  Rule: With a review identity the status and the approval are posted too

    Background:
      Given the github forge for the repo "o/r"
      And the forge has the review identity "reviewer"
      And the forge option "review_token_env" is "REV"
      And the forge credential variable "REV" is "t"
      And the repo has the open pull request 5 at the head "abc1234"
      And a file "report.md" containing:
        """
        ok
        """

    Scenario: A pass posts the report, the success status and the approval
      When the forge CLI runs "verdict 5 --pass --body-file report.md"
      Then the exit code is 0
      And the result "status" is "posted"
      And the comment posted on the CR "5" opens with "<!-- verdict abc1234 -->"
      And a call includes "statuses/abc1234 -f state=success -f context=review"
      And a call includes "-X POST repos/o/r/pulls/5/reviews"
