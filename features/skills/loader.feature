# Source: src/skills.ts "readSkills", "stepIdOf"; src/gates.ts "skillPackCheck"
@skill:loader
Feature: The skill loader and the pack check catch a broken pack
  One loader reads the pack for validate, dispatch, skill-regression, the ledger and bench. A step is the unit that runs;
  its id is `<skill>/<step>`, or the skill name alone for a one-step skill. Problems come back as errors and warnings,
  and the steps that are sound still load. These scenarios use small fixture packs; pack.feature checks the shipped one.

  Rule: A well-formed pack loads as steps with tiers

    Scenario: A skill with step files has one step per file, and a one-step skill is its own step
      Given a skills folder holding the standard fixture pack
      When the pack is read
      Then the pack has no error and no warning
      And the steps and their tiers are:
        | id            | tier     |
        | build         | deep     |
        | escalate      | fast     |
        | learn/judge   | fast     |
        | learn/improve | deep     |
        | plan/triage   | fast     |
        | plan/groom    | balanced |
        | plan/shape    | deep     |
        | review/review | balanced |
        | review/verify | balanced |
        | sdlc          | fast     |
        | ship          | balanced |

    Scenario: A step follows its own step file, and a one-step skill follows SKILL.md
      Given a skills folder holding the standard fixture pack
      When the pack is read
      Then the step "plan/shape" follows the file "plan/steps/shape.md"
      And the step "build" follows the file "build/SKILL.md"

  Rule: Installed skill folders are read as the skill they hold

    Scenario: A folder named sdlc-<skill> is the skill <skill>, and sdlc stays sdlc
      Given an installed skills folder holding the standard fixture pack, every skill but sdlc in a folder named sdlc-<skill>
      When the pack is checked
      Then the pack has no error and no warning
      And the skills are "sdlc, build, escalate, learn, plan, review, ship"
      And the steps are "sdlc, build, escalate, learn/judge, learn/improve, plan/triage, plan/groom, plan/shape, review/review, review/verify, ship"

    Scenario Outline: An old skill name counts as the step that replaced it
      Then the old name "<old>" is the step "<step>"

      Examples:
        | old               | step          |
        | implement-spec    | build         |
        | review-pr         | review/review |
        | shape             | plan/shape    |
        | triage-signal     | plan/triage   |
        | backlog-grooming  | plan/groom    |
        | verify-ux         | review/verify |
        | release           | ship          |
        | judge-run         | learn/judge   |
        | improve-factory   | learn/improve |
        | escalate-to-human | escalate      |
        | build             | build         |
        | plan/shape        | plan/shape    |

  Rule: Declared steps and step files agree

    Scenario: A step in the frontmatter with no file is an error, and the other steps still load
      Given a skills folder holding the standard fixture pack
      And the pack file "plan/steps/shape.md" is removed
      When the pack is read
      Then the pack has an error mentioning "step shape has no file steps/shape.md"
      And the steps are "build, escalate, learn/judge, learn/improve, plan/triage, plan/groom, review/review, review/verify, sdlc, ship"

    Scenario: A file in steps/ that the frontmatter does not declare is an error
      Given a skills folder holding the standard fixture pack
      And the pack file "plan/steps/extra.md" is:
        """
        extra
        """
      When the pack is read
      Then the pack has an error mentioning "steps/extra.md is not in metadata.steps"

  Rule: A skill declares its tier once

    Scenario: A skill with steps and a tier of its own is an error
      Given a skills folder holding the standard fixture pack
      And the pack file "review/SKILL.md" is:
        """
        ---
        name: review
        description: d
        metadata:
          tier: deep
          steps:
            review: { tier: balanced }
            verify: { tier: balanced }
        ---
        body
        """
      When the pack is read
      Then the pack has an error mentioning "metadata.steps and metadata.tier are both set"

    Scenario: An unknown tier is an error
      Given a skills folder holding the standard fixture pack
      And the pack file "build/SKILL.md" is:
        """
        ---
        name: build
        description: d
        metadata:
          tier: turbo
        ---
        body
        """
      When the pack is read
      Then the pack has an error mentioning "tier turbo invalid"
      And the steps are "escalate, learn/judge, learn/improve, plan/triage, plan/groom, plan/shape, review/review, review/verify, sdlc, ship"

    Scenario: A skill with no tier at all is an error
      Given a skills folder holding the standard fixture pack
      And the pack file "build/SKILL.md" is:
        """
        ---
        name: build
        description: d
        ---
        body
        """
      When the pack is read
      Then the pack has an error mentioning "metadata.tier or metadata.steps missing"

    Scenario: A top-level tier still loads, with a warning
      Given a skills folder holding the standard fixture pack
      And the pack file "build/SKILL.md" is:
        """
        ---
        name: build
        description: d
        tier: deep
        ---
        body
        """
      When the pack is read
      Then the pack has a warning mentioning "top-level tier is deprecated"
      And the pack has no error

  Rule: A skill folder names itself

    Scenario: A name that differs from the folder is an error
      Given a skills folder holding the standard fixture pack
      And the pack file "build/SKILL.md" is:
        """
        ---
        name: builder
        description: d
        metadata:
          tier: deep
        ---
        body
        """
      When the pack is read
      Then the pack has an error mentioning "frontmatter name 'builder' differs from the folder name"

    Scenario: A skill with no description is an error
      Given a skills folder holding the standard fixture pack
      And the pack file "build/SKILL.md" is:
        """
        ---
        name: build
        metadata:
          tier: deep
        ---
        body
        """
      When the pack is read
      Then the pack has an error mentioning "frontmatter description missing"

    Scenario: A skill folder with no SKILL.md is an error
      Given a skills folder holding the standard fixture pack
      And the pack file "build/SKILL.md" is removed
      When the pack is read
      Then the pack has an error mentioning "build: SKILL.md missing"

  Rule: The check reads what a skill file says

    Scenario: A broken relative link is an error
      Given a skills folder holding the standard fixture pack
      And the pack file "build/SKILL.md" is:
        """
        ---
        name: build
        description: d
        metadata:
          tier: deep
        ---
        see [the contract](../sdlc/references/nope.md)
        """
      When the pack is checked
      Then the pack has an error mentioning "broken link ../sdlc/references/nope.md"

    Scenario: A word that ties a skill to one setup is an error
      Given a skills folder holding the standard fixture pack
      And the pack file "build/SKILL.md" is:
        """
        ---
        name: build
        description: d
        metadata:
          tier: deep
        ---
        Post it as the review identity.
        """
      When the pack is checked
      Then the pack has an error mentioning "forbidden 'identity'"

    Scenario: A call of a verb the CLI does not have is an error
      Given a skills folder holding the standard fixture pack
      And the pack file "build/SKILL.md" is:
        """
        ---
        name: build
        description: d
        metadata:
          tier: deep
        ---
        Run `agentic-sdlc forge nope 3`.
        """
      When the pack is checked
      Then the pack has an error mentioning "'forge nope' is not a verb"

    Scenario: A flag the verb does not take is an error
      Given a skills folder holding the standard fixture pack
      And the pack file "build/SKILL.md" is:
        """
        ---
        name: build
        description: d
        metadata:
          tier: deep
        ---
        Run `agentic-sdlc vcs push --all`.
        """
      When the pack is checked
      Then the pack has an error mentioning "'--all' is not a flag of 'vcs push'"

    Scenario: A dispatch of a step the pack does not hold is an error
      Given a skills folder holding the standard fixture pack
      And the pack file "build/SKILL.md" is:
        """
        ---
        name: build
        description: d
        metadata:
          tier: deep
        ---
        Run `agentic-sdlc dispatch plan/nope --ticket 1`.
        """
      When the pack is checked
      Then the pack has an error mentioning "'dispatch plan/nope' is not a step id"

    Scenario: A call of a real verb with its flags passes
      Given a skills folder holding the standard fixture pack
      And the pack file "build/SKILL.md" is:
        """
        ---
        name: build
        description: d
        metadata:
          tier: deep
        ---
        Run `agentic-sdlc gate evidence --sha x`, then `agentic-sdlc dispatch plan/shape --ticket 1`.
        """
      When the pack is checked
      Then the pack has no error and no warning
