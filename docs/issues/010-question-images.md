Issue: https://github.com/RazvanAga/quiz/issues/10

## What to build

Add optional images to Questions end-to-end. An upload endpoint saves a Question image to disk under the `data/uploads` area and returns its URL; the editor lets an Admin attach/replace/remove an image on a Question (text always present, image optional); the image displays during the intro beat and answering on both the Host and Player screens.

## Acceptance criteria

- [ ] Upload endpoint stores the image on disk under `data/uploads` and returns a served URL
- [ ] Editor: attach / replace / remove an optional image on a Question
- [ ] The image renders on the Host and Player screens during the Question
- [ ] `data/uploads` is gitignored and backed up with the data folder
- [ ] Finish with a commit describing what was achieved

## Blocked by

- #4
- #6