# Projects, membership, forking and audit

**Design note, extending `prd.md`. Decisions closed; implementation follows this.**

---

## Membership is logical, never a folder

A prompt or a template belongs to zero or more **projects**. Membership is a set
of labels on the artifact. It never means "a file exists in that directory".

This settles the collision the first draft of this note raised. `Project` in the
existing code means a folder on disk: it has a `path`, it can be a git
repository, and `files.ts` reads and writes inside it. That stays exactly as it
is, as a workspace you can open and browse. It is orthogonal to membership. A
project may have a path, or members, or both, and neither implies the other.

Nothing is ever expected to be in two places at once, so nothing can diverge.

### But "tag" is already taken

The word `tag` in this codebase does not mean a label on an artifact. It means an
**XML element name**, registered with a purpose, a `use_when`, an example and an
enforcement level. The seeded registry is `task`, `context`, `constraints`,
`input`, `output_format`, `examples`, `pii_policy`, `untrusted_input` and so on.
Verification pulls the element names out of a prompt's body with
`/<([a-z_][a-z0-9_]*)[^>]*>/` and checks them against that registry.

So membership labels must not go into the tag registry. Two concrete failures if
they did:

- `checkRequiredTags` asserts that every prompt **contains** every tag whose
  enforcement is `required`. A membership label that ever acquired that
  enforcement would fail every prompt in the store for not containing a
  `<serrin>` element.
- `checkApprovedTags` would silently widen the approved XML vocabulary to include
  every project name, and `usage_count` would start mixing "used as an element"
  with "used as a project label".

The idea is right and it is the one implemented: membership is a logical label,
with no filesystem behind it. It just needs its own namespace. On the artifact it
is a `projects: string[]`, with a small registry of project labels so the tree can
list a project that has no members yet, and so the reserved two cannot be taken.
The tag registry is untouched.

---

## The model

Two reserved projects, which cannot be renamed or deleted:

| Project | Meaning |
|---|---|
| `General` | Where an artifact lives when it belongs to nothing else. Joinable on purpose too. |
| `Archive` | Retired from production, kept for traceability. |

### Invariants

> **1. Every artifact is a member of at least one project.**
> `General` is how the system spells "no project".

> **2. No artifact is ever destroyed.**
> Every removal path ends in another project, in `General`, or in `Archive`.

The second falls out of "templates are not deleted either, same rules of the
game", and it is worth stating as an invariant rather than a behaviour because it
is the property that makes the audit trail meaningful. A trail that records the
history of things that no longer exist is an inventory of gaps.

### Archive is exclusive

Joining `Archive` clears every other membership. An artifact that is retired but
still listed under three live projects is not retired.

The `archived` audit entry therefore records the memberships it cleared, in its
`before` field, because unarchiving cannot restore what it does not remember.
Not in a second field of its own: an earlier draft carried a `detail.cleared`
alongside `before`, which the end-to-end walkthrough caught being written by the
explicit archive endpoint and not by the project-deletion path. `before` is
always there and always right. Unarchiving puts the artifact in `General`;
restoring the previous set from the record is a later feature the data already
supports.

---

## Operations

One rule covers every awkward case:

> **Any removal that would leave an artifact with no memberships asks the user,
> with two named outcomes: archive it, or move it to `General`.**

| Operation | Effect |
|---|---|
| Create | Joins the selected project, or `General` |
| Add to a project | New membership. The others are untouched |
| Remove, others remain | That membership goes. Nothing else changes |
| Remove, none remain | Ask: `Archive`, or `General` |
| Remove from `General`, others remain | That membership goes |
| Remove from `General`, none remain | Ask: `Archive`, or keep in `General` |
| Delete a project | Per member, remove that one membership, then apply the rule above |
| Archive | Clears all memberships, joins `Archive`, records what it cleared |
| Unarchive | Leaves `Archive`, joins `General` |
| Fork | A new artifact, see below |

Deleting a project removes exactly one membership from each of its members. An
artifact with another home loses this one and is otherwise untouched, which is
what the brief asked for. The archive-or-`General` answer applies only to the
artifacts that would be left with nothing, so the confirmation states how many
that is: "Delete Project 01. Four of its nine prompts have no other project."
When that number is zero, the question does not need asking.

---

## Forking

Because membership is logical, duplication is cheap and unambiguous: copy the
artifact, copy its memberships, and let the copy have its own life.

- New id. Name defaults to `<name> (copy)` and is editable immediately.
- Content and memberships are copied. Nothing is shared afterwards.
- **Version history is not copied.** An independent lifecycle starts at version 1.
  What connects the two is provenance, not history.
- `forked_from: { id, name, version }` is recorded once and never changes. It
  holds the source **id**, so renaming either side later leaves it intact, and
  the source **name and version** as they were at the moment of the fork, so the
  record still reads correctly after the source moves on.
- Two audit entries, not one: `forked_to` on the source and `forked_from` on the
  copy. The trail has to read correctly from whichever artifact you are looking
  at, and someone reading the source's history needs to know a copy left.

**Forking an archived artifact is allowed, and the copy lands in `General`.**
Archive is a state of one artifact, not a property of its content. So forking is
how a retired prompt gets revived without disturbing the record of its
retirement, which is better than unarchiving it and losing the fact that it was
ever retired.

Built-in templates are read-only: they cannot be archived or removed from
`General`. Forking is the supported way to modify one, which is what the affordance
is for.

---

## Audit

Append-only JSONL at `data/audit.jsonl`. One JSON object per line.

```json
{
  "at": "2026-08-25T09:14:02.117Z",
  "actor": "local user",
  "kind": "prompt",
  "artifact_id": "...",
  "operation": "created | renamed | added_to | removed_from | archived | unarchived | forked_from | forked_to",
  "project": "Project 01",
  "before": ["General"],
  "after": ["General", "Project 01"]
}
```

Four decisions in that shape:

**`before` and `after`, not a delta.** One line answers "what was true before
this?" without replaying the file, and a missing line becomes detectable: two
consecutive entries for the same artifact whose `after` and `before` disagree.

**Written after the state change, never before.** There is no transaction to join:
the store is an in-memory `Map` and the trail is a file. Given that, a missing
entry is the failure to prefer, because the before/after chain exposes it, while
an entry for a change that did not happen is invisible. This is best effort until
storage is a real database, and the note says so rather than implying otherwise.

**`actor` is the literal string `local user`.** There is no authentication and no
prompt/user relation. The trail answers what happened and when, not who, and
labelling the placeholder honestly is better than a field that looks like an
identity.

**`renamed` is in the list.** Names change and the trail is read by name later.
Without it, a history becomes unreadable the first time something is renamed.

Reading one artifact's history is a linear scan with a filter on `artifact_id`.
That is fine into the low tens of thousands of lines. Past that the answer is an
index or SQLite, not a faster scan. The file only grows; there is no rotation,
deliberately, because rotating an audit trail means deciding what to forget.

---

## API

```
GET    /api/v1/projects/                     includes General and Archive
POST   /api/v1/projects/                     create a project label
DELETE /api/v1/projects/:name?orphans=archive|general
         -> 409 { orphan_count: n } when orphans is missing and n > 0
         -> 409 for General and Archive
GET    /api/v1/projects/:name/orphan-count   to populate the confirmation
GET    /api/v1/projects/tree                 each project with its prompts and templates

GET    /api/v1/prompts/:id/projects
POST   /api/v1/prompts/:id/projects          { project }
DELETE /api/v1/prompts/:id/projects/:project
         -> 409 { requires: "archive_or_general" } when it would orphan
POST   /api/v1/prompts/:id/archive
POST   /api/v1/prompts/:id/unarchive
POST   /api/v1/prompts/:id/fork              { name? }
GET    /api/v1/prompts/:id/audit

… and the same five under /api/v1/templates/:id/
```

The 409-then-repeat pattern is deliberate. The server refuses to guess, so no
client can archive things by forgetting a query parameter.

---

## UI

**Labels on the editor.** The projects an artifact belongs to, each removable.
`Archive` renders differently, because it is a state and not a place.

**Tree view.** One level. A project expands to its prompts and its templates. No
nesting. `General` first, `Archive` last and collapsed, since it is the least
interesting thing in the list until the moment it is the only thing that matters.

**Fork.** On the editor and in the list. Lands the user in the copy, named and
focused, because the first thing anyone does after duplicating something is
rename it.

**The confirmation dialog.** Two named buttons, the count of affected artifacts,
no default action.

**The audit** is not in the UI yet. It is a file and an endpoint, which is enough
to answer a question when one comes up.
