# Third-party notices

SpecTrace itself is licensed under Apache-2.0 (see [`LICENSE`](LICENSE)). This
file lists material in this repository that is **not** covered by that license,
either because it originates with a third party or because it is sample data
published under different terms.

Runtime dependencies installed from npm are not listed here — they are declared
in each package's `package.json` and resolved by `pnpm-lock.yaml`, and are not
redistributed in this repository.

---

## unjs/hookable — MIT

`fixtures/experiment/index.jsonl` is a SpecTrace index artifact built from
[unjs/hookable](https://github.com/unjs/hookable) at the frozen commit
`b77477c027039362ee0ec4f39b8998c4f1b21707` (tag `v6.1.1`), recorded in
`fixtures/experiment/repository.yaml`. Its `signature`, `documentation`, and
`normalizedSource` fields contain excerpts of that project's source, so the
artifact is a derivative work of it and carries hookable's license.

The requirement documents in `fixtures/experiment/requirements/` are **not**
derived from hookable's source — they were authored independently from its
public documentation (see `fixtures/experiment/README.md`) and are covered by
this repository's Apache-2.0 license.

```
The MIT License (MIT)

Copyright (c) Pooya Parsa <pooya@pi0.io>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## fixtures/todo-example — MIT

`fixtures/todo-example/` is a standalone example TypeScript library written for
this project as harness data. It is published under MIT rather than Apache-2.0
so it can be copied into other repositories as a starting point without
inheriting SpecTrace's terms. Its license text lives at
[`fixtures/todo-example/LICENSE`](fixtures/todo-example/LICENSE).
