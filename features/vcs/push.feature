# Source: src/vcs/git.ts "push"
@cli:vcs
Feature: Vcs push
  The vcs port refuses to push the trunk, so that a change reaches the trunk only through a CR. A push from a
  detached HEAD names no branch, so it is refused too. A push from a change line goes through.
