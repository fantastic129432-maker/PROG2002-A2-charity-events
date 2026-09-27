# How to record the demonstration video

This is the operating sheet: which tool to use on this machine, what to prepare,
and the exact URLs to type. The words to say are in `video-script.md`; this file
is about the mechanics of recording them.

---

## 1. What to record with (decided for this machine)

| Tool | Status here | Verdict |
| --- | --- | --- |
| **Snipping Tool** (`SnippingTool.exe`) | Installed, version 11.2607.23.0 | **Use this.** The Windows 11 version records the screen with the microphone. |
| Xbox Game Bar (`Win`+`G`) | **Not installed** | Unavailable - pressing Win+G will do nothing. |
| PowerPoint (Insert > Screen Recording) | Installed | Fallback if the Snipping Tool misbehaves. Records without audio by default, so audio must be enabled. |
| OBS Studio | Not installed | Only worth installing if you want scene switching and separate audio tracks. Not needed for this. |

### Recording with the Snipping Tool

1. Press `Win` + `Shift` + `S`, then choose the **record** icon (the video camera
   at the right of the toolbar).
2. Click **+ New**, or press `Win` + `Shift` + `R` to start a recording directly.
3. Before you begin, open the **microphone** toggle and check the correct input is
   selected. On this laptop the input is *麦克风阵列 (2- Realtek(R) Audio)*.
4. Select the area to record: the **whole screen** is simplest, and it keeps your
   editor and the browser reachable.
5. Press **Start**, and stop with the toolbar or `Win` + `Shift` + `Q`.
6. The clip is saved to `Videos\Screen Recordings` by default.

**Before the first take, record 20 seconds and play it back with sound.** The two
failures that waste the most time are a muted microphone and a recording that
captured the wrong monitor.

---

## 2. Prepare the screen before recording

The three servers were verified running (MySQL on 3306, API on 3000, client on
5500, `/api/health` reports connected). If the machine has been restarted since,
start them with `start-all.cmd`.

### Tabs, in this order

| # | Tab | Why |
| --- | --- | --- |
| 1 | `http://localhost:5500/index.html` | Home page - Question 3 opens here |
| 2 | `http://localhost:5500/search.html` | Search page - the main demonstration |
| 3 | `http://localhost:3000/api/events?state=all&limit=3` | Raw JSON, to show the API answering |
| 4 | Your GitHub repository, commits page | Work progress, at the end |
| 5 | Postman, with the saved collection | Question 1 |

Open in your editor, ready to show:

* `database/01_schema.sql` - the schema and the two views
* `api/src/db/event_db.js` - the required connection file
* `api/src/repositories/repository.mysql.js` - the search SQL
* `clientside/js/search.js` - collecting the form and calling the API
* `clientside/js/dom.js` - turning the response into DOM

If MySQL Workbench is installed, open `charityevents_db` with the SCHEMAS panel
expanded for Question 1.

### Exact URLs to have ready

Paste these rather than typing them on camera:

```
http://localhost:3000/api/events?state=all&limit=3
http://localhost:3000/api/events?state=all&city=Lismore&category=1&from=2026-01-01
http://localhost:3000/api/events?from=2026-12-01&to=2026-01-01
http://localhost:3000/api/events/11
```

What each one shows:

* the first returns the list, so the JSON envelope is visible;
* the second filters on three criteria at once and returns exactly one event;
* the third is deliberately invalid and returns HTTP 400 with a `details` array
  naming the field - this is the validation to demonstrate;
* the fourth is the suspended event and returns 404, which proves it is hidden.

---

## 3. Silence the machine first

Do these in order; each one has ruined a take for someone.

1. **Notifications**: `Win` + `A` to open Quick Settings, turn on **Do not
   disturb** (the crescent moon). On this build it is in the notification centre.
2. Close Outlook, Teams, Discord, WeChat and the browser tabs you do not need.
   A notification banner in the middle of a demonstration is the most common
   blemish.
3. Set the browser zoom to 110-125% (`Ctrl` + `+`). At 100% the code and the JSON
   are hard to read after the video is compressed.
4. Hide the bookmarks bar (`Ctrl` + `Shift` + `B`) so more of the page is visible.
5. Turn off the screensaver and sleep: `Settings > System > Power` - or simply
   wiggle the mouse while you talk.
6. Charge the laptop, and plug the charger in. Some machines throttle the CPU on
   battery, which makes the pages feel slow on camera.

---

## 4. Length and structure

The limit is **15 minutes**, and the brief marks three specific questions. The
timeline in `video-script.md` is 13 minutes and 30 seconds, which leaves a margin
for load times:

| Section | Length |
| --- | --- |
| Introduction, with your name and student number | 0:40 |
| Question 1 - database and API architecture | 4:20 |
| Question 2 - data flow between API and website | 3:30 |
| Question 3 - the three pages, live | 4:00 |
| Work progress, testing and closing | 1:00 |

**Record in sections, not in one take.** Record the introduction, stop, record
Question 1, stop, and so on. You can then re-record only the part you fumbled,
and the parts are joined in the OneDrive video editor or in Clipchamp, which is
already installed. A single 14 minute take almost always contains one word you
will want to redo.

---

## 5. Ten minutes of rehearsal, then record

Run through the three demonstrations once **without recording**, and fix whatever
is slow or broken before it is on camera:

1. Open the home page and let the event list load.
2. On the search page, filter by Lismore and Fun Run and a date range, then press
   Clear Filters, then trigger the invalid date range.
3. Open an event and press Register, so the "under construction" dialog appears
   at least once - you need to know where it renders.

Time yourself. If a section runs long, cut detail from the tour rather than
rushing the explanation: the marker is listening for the three questions, not for
a complete inventory of the site.

---

## 6. After recording

- [ ] Watch it back with the sound on. Check that your name and student number are
      audible in the first 30 seconds.
- [ ] Confirm it is under 15 minutes.
- [ ] Confirm the three question headings are answered out loud, not merely shown.
- [ ] Confirm the exact sentence **"This feature is currently under
      construction."** is audible when you press Register.
- [ ] Upload to your **SCU OneDrive**, set the sharing so anyone with the link can
      view, and test the link in a private browser window - not the one you are
      signed into.
- [ ] Paste the shareable link into the Blackboard submission.

---

## 7. If something goes wrong

| Symptom | Cause and fix |
| --- | --- |
| No sound in the recording | The microphone toggle in the Snipping Tool toolbar was off, or the wrong input device was selected. Check before every take. |
| The recording is of the wrong screen | The area selector defaults to the primary display. Drag it over the screen you are actually demonstrating. |
| The event list is empty on camera | The API stopped. Check `http://localhost:3000/api/health`; if it is down, run `start-all.cmd` again. |
| Pages load slowly and the take feels sluggish | Run `node tests/run-tests.js` beforehand to warm the pool, close other applications, and plug in the charger. |
| A notification appears mid-take | Stop, re-record that section, and cut it in the editor. Do not restart the whole video. |
| You forget what to say | Keep `video-script.md` open on a second screen or on paper. Reading a prepared script is normal and not penalised. |
