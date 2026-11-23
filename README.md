# Todo

A simple, paper-style to-do list that runs in your browser. It works offline on one device, and you can optionally add cloud sync, a passphrase lock and a calendar feed.

**Contents**

1. [Quick start](#quick-start)
2. [Tasks and reminders](#tasks-and-reminders)
3. [Dates and times](#dates-and-times)
4. [Recurring tasks and streaks](#recurring-tasks-and-streaks)
5. [Syncing across devices (your account)](#syncing-across-devices-your-account)
6. [Passphrase lock](#passphrase-lock)
7. [Calendar integration](#calendar-integration)
8. [Wall display mode](#wall-display-mode)
9. [Backup and restore](#backup-and-restore)
10. [Troubleshooting](#troubleshooting)

---

## Quick start

- Type a task in the box at the top and press **Add**. Dates can wait.
- Put `#tag` anywhere in the text to label it. `Lab 3 report #MTE502` creates the task "Lab 3 report" with the tag MTE502.
- Tap a task to open it. Tap the circle on its left to mark it done.
- Tap the list title at the top to rename the list.
- On a blank list, tap **load a few sample tasks** to see how everything looks.

Your list is saved in this browser automatically. Nothing leaves your device unless you turn on cloud sync.

## Tasks and reminders

Your list has four sections. You can collapse any of them by tapping its heading.

| Section | What goes there |
| --- | --- |
| **TODO** | Tasks with a to-do date |
| **Unorganized** | Tasks with no date yet. Give one a to-do date and it moves to TODO |
| **Reminders** | Things that happen on a date, like a renewal, a class or a work session |
| **Completed** | Finished items. Use **Clear completed** to delete them all |

**Tasks vs reminders.** A task is something you do. A reminder is something you want to be told about on a date. Use the **+** next to a section heading, or the pencil on any item, to open the full form and choose the type.

**Tags and filtering.** Tags show up as chips under the quick-add box. Tap a chip to show only that tag, and tap **All** to clear the filter. New tasks you type in the quick-add box get the tag you're currently filtering by.

**Grouping.** Switch between **By tag** and **By date** above the list. By date shows a timeline of the days ahead with a line for each empty day, so you can see how busy the week is. Long runs of empty days collapse into one "N empty days" line.

**Status.** In the TODO section, tap the **Scheduled** pill on a task to switch it to **In progress**, and tap again to switch back.

**Subtasks.** Open a task and add subtasks at the bottom. Tick them off as you go, and edit a subtask's wording by tapping it. Finished subtasks move to their own list. The row shows progress like `2/5`.

**Linked reminders.** When you create or edit a task, you can link it to a reminder. The task shows a link pill you can tap to jump to the reminder. Linked tasks stay off your calendar, and the reminder shows there instead with its tasks listed.

**Sound.** Completing something plays a short chime. You can turn this off in the cloud settings. On iPhone and iPad, the silent switch mutes it.

## Dates and times

Every task and reminder can have two dates:

- **To-do date** is when you plan to work on it. For reminders this is called **Reminder date**.
- **Due date** is the official deadline.

Under each date there is an optional **time** box.

- Pick a date first, then a time. The time box is greyed out until the date is set. Clearing the date clears the time.
- Tap the **×** beside a time box to remove just the time.
- Reminders don't have a to-do time box. Use the **All day / Time block** control instead, which sets a start and end time. They can still have a due time.

**What the colors mean**

- **Amber:** due or planned for today or tomorrow.
- **Red:** overdue. If a due date has a time, the task turns red once that time passes today. If a task has no due date, its to-do date and time are used instead. Red rows update on their own without refreshing the page.
- The pills on each row show the dates, times and the gap between them, such as "3d buffer".

Within a day, tasks are ordered by time. Tasks with no time come first.

## Recurring tasks and streaks

Recurring tasks are created from a **reminder**.

1. Open a reminder (tap it in the Reminders section).
2. Under **Recurring tasks**, tap **Generate recurring task**.
3. Enter a title, pick the days of the week (shortcuts for **Weekdays** and **Every day**), and choose a start date.
4. Choose how long it repeats: a number of weeks, or **Repeat indefinitely**.
5. Tap **Create**.

The app then adds the matching tasks to your TODO list, one for each scheduled day, about a week ahead.

- **Only add each task on its day:** when ticked, each task appears only on its own day and disappears once the day has passed, done or not. When off, missed tasks stay on your list as past due.
- **Streaks:** a flame pill counts how many scheduled days in a row you finished the task on the day it was scheduled. Today doesn't break your streak until the day is over.
- **Stopping:** tap the **×** next to a recurring task in the reminder. Its unfinished tasks from today onward are removed. Finished and past tasks stay.
- **Pausing:** marking the reminder itself done pauses generation. Mark it not done to resume.
- A reminder can hold up to 20 recurring tasks.

## Syncing across devices (your account)

Paper Todo has no usernames or passwords. Your **account ID** is what ties your devices together. Anyone who has the same ID (and the same Firebase project) sees the same list, so treat it like a secret.

Cloud sync uses a free Firebase Firestore database that you set up once. After that, edits on one device appear on the others within moments, and changes merge task by task, so editing different tasks on two devices at the same time is safe.

### One-time setup

1. In the [Firebase console](https://console.firebase.google.com/), create a project and add a **Firestore Database**.
2. In **Project settings**, add a **Web app** and copy its `firebaseConfig`.
3. Save the config in `firebase-config.js` next to `index.html`. If you can't edit files, you can paste it into the box in the sync window instead.
4. In Firestore **Rules**, paste the following and publish:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{db}/documents {
    match /paperTodo/{accountId} {
      allow get, delete: if true;
      allow create, update: if request.resource.data.schema == 2;
    }
    match /paperTodoCal/{token} {
      allow get, delete: if true;
      allow create, update: if request.resource.data.schema == 2;
    }
  }
}
```

These rules let anyone who knows a document's exact name read or write it, but nobody can list your data. That is why the account ID needs to be long and private.

### Connecting a device

1. Tap the **cloud icon** at the top right.
2. Tap **Generate** to create an account ID, or type your own (8 to 64 letters, numbers, `-` or `_`). **Copy it somewhere safe.**
3. Tap **Connect & sync**.
4. On your other devices, open the app, enter the **same account ID**, and connect.

The dot on the cloud icon shows the state: green is synced, amber is working, red is a problem. Tap the cloud for details.

**Turn on the passphrase lock first** (next section). With the lock off, your tasks are stored unencrypted in Firestore, and the app will warn you before connecting.

### Disconnecting

- **Disconnect** stops syncing but keeps the data on this device.
- **Disconnect & erase this device** also wipes this device's copy. The cloud copy is untouched, so connecting again with the same account ID brings everything back.

## Passphrase lock

The lock encrypts your tasks with AES-256, both on your device and in the cloud.

**Turn it on:** cloud icon, then **Passphrase lock**, enter a passphrase of at least 6 characters twice, and tap **Turn on lock**.

- You'll be asked for the passphrase every time you open the app.
- A **padlock** appears at the top. Tap it to lock immediately.
- Use the same passphrase on every synced device.
- **The passphrase is never stored anywhere. If you forget it, encrypted data cannot be recovered.** The lock screen's "Forgot it?" link only erases this device's copy. If you sync, the encrypted cloud copy is still there but unreadable without the passphrase.
- **Remove lock** goes back to unencrypted storage.

## Calendar integration

The calendar feed lets your phone's calendar show your tasks. You subscribe once, and it updates by itself afterwards. It is **one-way**: changes in your calendar app don't come back into Paper Todo.

**You need:** cloud sync turned on, and a free Cloudflare account for a one-time setup.

### One-time setup

1. Make sure cloud sync is connected (see above).
2. Create a free account at [dash.cloudflare.com](https://dash.cloudflare.com).
3. Open **Workers & Pages** and create a new Worker. Name it something like `todo-calendar`.
4. Tap the **calendar icon** in the app, open **Set up the free Cloudflare Worker**, and tap **Copy code**.
5. In Cloudflare, open the Worker's code editor, replace everything with the copied code, and **Deploy**.
6. Copy the Worker's address (it ends in `.workers.dev`) into the **Worker URL** box in the app. This is saved with your account, so you only do it once.
7. Make sure the `paperTodoCal` block is in your Firestore rules (included above).

### Subscribing

1. In the calendar window, tap **Turn on calendar feed**.
2. Subscribe:
   - **iPhone, iPad, Mac:** tap **Subscribe on this device**, or copy the iPhone/iPad/Mac link and add it as a subscribed calendar.
   - **Google Calendar:** copy the Google Calendar link, then in Google Calendar choose **Other calendars**, then **From URL**, and paste it.
3. Open any task or reminder and tick **Show on my calendar feed**. Only ticked items appear.

### What shows up

| Item | In your calendar |
| --- | --- |
| Task with no time | All-day entry on its to-do date (`Do: …`) and due date (`Due: …`) |
| Task with a to-do time | A 30-minute entry at that time. It shows as busy |
| Task with a due time | A 30-minute `Due: …` entry at that time. It shows as free, so deadlines don't block your schedule |
| Reminder, all day | All-day entry |
| Reminder, time block | An entry from the start to the end time |
| Completed items | Removed from the feed |
| Task linked to a reminder | Left off. The reminder shows instead, with its tasks in the details |

Times are treated as your local time.

### Things to know

- **Refresh delay.** Apple Calendar usually updates within hours. Google Calendar can take up to about a day. Changes aren't instant.
- **Privacy.** Anything you tick for the feed (title, tag, notes and dates) is stored **unencrypted**, even with the passphrase lock on, because your calendar app can't decrypt it. Anyone with the link can read it. Only share the link with yourself.
- **Make a new link** cuts off the old one. Do this if the link leaks, then re-subscribe.
- **Turn off** removes the feed. Calendars subscribed to it stop updating.

## Wall display mode

Open the app with `?display` on the end of the address to get a read-only dashboard, useful for a tablet or monitor on a wall.

- Example: `https://your-site.example/?display`
- Add `&zoom=1.5` to make everything bigger (from 0.6 to 3).
- It shows a clock and your open tasks and reminders, and hides completed items and all the editing controls.
- It refreshes itself every night around 3 a.m. If you use the passphrase lock, it won't auto-refresh, because that would lock it.
- It reads the list on that device, so connect cloud sync on the display device to keep it current.

## Backup and restore

In the cloud window, under **Backup**:

- **Export JSON** downloads a backup of your whole list. **The file is not encrypted**, even if the lock is on, so keep it somewhere safe.
- **Import JSON** replaces everything with the backup. This includes your list on every synced device, so you'll be asked to confirm first.

## Troubleshooting

| Problem | What to try |
| --- | --- |
| "Sync problem … permission" | Your Firestore rules are missing or wrong. Paste the rules from the setup section and publish them |
| "Could not load Firebase. Are you offline?" | Check your connection and reload |
| "The cloud copy is encrypted" | Turn on the passphrase lock using the **same passphrase** as your other devices |
| "That passphrase does not match the cloud copy" | You're using a different passphrase from the one that encrypted the cloud data |
| Calendar says "Add your Worker URL" | Finish the Cloudflare setup and paste the `.workers.dev` address in the calendar window |
| "Feed upload problem" | Add the `paperTodoCal` block to your Firestore rules |
| Calendar isn't showing a new task | Check that **Show on my calendar feed** is ticked and the task isn't linked to a reminder, then wait for your calendar app to refresh |
| Changes didn't appear on another device | Check the dot on the cloud icon. Both devices need the same account ID and the same passphrase |
| Forgot my passphrase | On the lock screen, use **Forgot it? Erase this device's copy**. Encrypted data can't be recovered without the passphrase. If you have an unencrypted export, you can import it afterwards |
| "Could not save on this device" | The browser's storage is full or blocked. Free up space, or avoid private browsing mode |
