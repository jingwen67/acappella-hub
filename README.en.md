**Official release v1.0** · [Changelog](CHANGELOG.md) · [Open Hub](https://cucac-hub.vercel.app)

# A Cappella Hub · CUCAC User Guide

[中文](README.md) | **English**

A hub for CU Chinese A Cappella member profiles, scores, and solo voting. Use the same account for voting and the score library.

**Website: [Open A Cappella Hub](https://acappella-hub.elenazhang0607.chatgpt.site)**

This is the link to use and share. GitHub stores the code; you do not need to download code, have a GitHub account, or run a program to use the website.

<a id="quick-start"></a>
## Quick Start

**We recommend adding the website to your phone’s home screen so you can open it like an app to browse scores and vote.** No App Store download is needed.

<a id="mobile"></a>
### On Your Phone: Add to Home Screen

1. Open [A Cappella Hub](https://acappella-hub.elenazhang0607.chatgpt.site) in your phone’s browser.
2. **iPhone:** Open in Safari or Chrome, choose **Add to Home Screen** from the share menu, then tap **Add**.
3. **Other phones:** Look for **Add to Home Screen** or an installation option in the browser menu. Availability and wording depend on the browser.
4. Open the **CUCAC** icon on your home screen and sign in.

This is a home screen shortcut to the website and requires an internet connection. If you already have an account, use it on both your phone and computer; no new registration is needed.

### Your First Visit

1. Open the **CUCAC** home screen icon or the website link above.
2. Tap **第一次来？注册** (“First time? Register”) to create an account with your name, or sign in if you already have one.
3. Fill in your information under **My profile**.
4. From the home page, open **Members**, **Scores**, or **Solo voting**.

## Contents

- [Quick Start](#quick-start)
- [On Your Phone](#mobile)
- [Everyday Use](#members)
- [Accounts and Sign-in](#accounts)
- [My Profile](#profile)
- [Members](#roster)
- [Solo Voting](#voting)
- [Browse Scores](#scores)
- [Upload and Edit Scores](#upload)
- [Administrators and Music Directors](#management)
- [Roles and Permissions](#roles)
- [Assign Roles and Manage Members](#manage-members)
- [Manage Voting Rounds](#rounds)
- [FAQ](#faq)
- [Initial Google Score Library Setup](#google-setup)
- [Setup Tips](#setup-tips)
- [Future Website Changes](#changes)
- [Development and Hosting](#development)
- [Run Locally](#local)
- [Private Data](#private-data)
- [Hosted Sites Version](#hosting)

<a id="members"></a>
## Everyday Use

**Using your phone:** Follow the [home screen setup steps](#mobile) above. Then tap the **CUCAC** icon and sign in to browse scores, vote for solos, and update your profile.

<a id="accounts"></a>
### Accounts and Sign-in

- Your **name** is your username, up to 20 characters. Choose a name other members will recognize. Usernames must be unique; capitalization does not distinguish English names.
- Your **password** must be 4–72 characters. Use a password dedicated to this website.
- Registration takes you directly to the home page. Use the same name and password to sign in on another device.
- Your username and **English full name** are separate fields. Editing your full name does not change your username.
- Select **Log out** after using a shared device.
- Contact an administrator if you forget your password. There is no email password recovery; administrators can reset regular members’ passwords.

<a id="profile"></a>
### My Profile

Open **My profile** from the home page. Fill in your English full name, pronouns, voice part, school, graduation year, major, fun fact, and favorite food, then save. Use a four-digit graduation year, such as `2027`.

Each profile has a **Photo gallery**. Any signed-in member can add photos of that person. Each photo must be under 5 MB; JPG, PNG, WebP, and GIF are supported. Click a photo to enlarge it and see who uploaded it.

- The **profile owner** can delete any photo in their gallery and choose **Set as avatar**.
- **Uploaders** can delete their own uploads. Other members cannot change the owner's avatar.
- Deleting the photo used as the current avatar removes the avatar too; choose another photo afterward.
- Existing avatars are automatically preserved when the gallery is first opened. Without an avatar, the first character of the member's name is shown.

Profiles and galleries are visible to other signed-in members. Share only information and photos you are comfortable sharing with the group.

<a id="roster"></a>
### Members

- Members are grouped into **Active** and **Alumni**.
- Select a member’s name to view their profile.
- Regular members can edit only their own profiles, not other members’ roles or accounts.
- Music Director, Arranger, and board position labels are assigned by an administrator or someone with the appropriate permission; you cannot assign them to yourself through your profile.

<a id="voting"></a>
### Solo Voting

#### Join a Round

1. Open **Solo voting** to see the current round’s song and arranger.
2. Select the participation button to enter the solo selection. Your name will appear in the candidate list.
3. To withdraw, select the withdrawal button and confirm. Withdrawing removes votes cast for you in this round.

If no round is active, wait for a Music Director to open one. Only one round can be active at a time.

#### Vote for Candidates

Each candidate has two options:

 | Option | Meaning | 
| --- | --- |
 | Sounds great!** | You think they are a good fit for this song’s solo. | 
 | Not sure yet** | You are not sure yet and would like to hear other candidates. | 

- You can give feedback on multiple candidates; you are not limited to one.
- Each account can keep one choice per candidate. Selecting the other option replaces your previous choice.
- Selecting an option you have already chosen cancels that choice.
- Choices save automatically; no separate submission is needed. Your choices also appear when you sign in with the same account on another device.
- You cannot change your votes after the round ends.

#### Who Can See Results?

Regular members can see their own choices but not aggregate vote counts. **Music Directors and the round’s assigned Arranger** can view the round’s totals. Eligible viewers can also access the relevant historical rounds; up to the 12 most recent completed rounds are shown.

Results help Music Directors and arrangers make their decision; the system does not automatically select the soloist. Being an administrator alone does not grant access to aggregate results.

<a id="scores"></a>
### Browse Scores

1. Open **Scores** from the home page.
2. Choose a semester, such as `2026 Fall`, in the score browsing area.
3. Open a song folder or the semester folder link to view and download scores in Google Drive.

An administrator must configure the Google score library first. If the page says setup is incomplete, contact an administrator. Members do not need to configure Google Cloud themselves.

Your website account and Google account are separate. Drive files still follow Google Drive sharing permissions. If access is denied, check that you are signed in to the correct Google account and ask a club administrator for folder access.

<a id="upload"></a>
### Upload and Edit Scores

Only accounts assigned the **Arranger** role can upload and edit scores. Being a Music Director or holding another club position does not automatically grant upload permission.

#### Upload a New Song

1. Open **Scores** and find the upload form.
2. Enter the song title.
3. Select one or more arrangers. If a name is missing, enter it and select **Add**.
4. Choose a semester.
5. Select **All members**, **Small group**, or both. At least one is required.
6. Select one or more files, or upload a folder using a browser that supports folder selection.
7. Select **Upload** and wait for the success message.

Files are stored under `Club root folder → Semester → Song title`, with a record added to the Google Sheets score index. Common formats include PDF, MuseScore `.mscz`, MusicXML `.musicxml` / `.xml` / `.mxl`, and images.

For the hosted version, **all files in one upload must total less than 20 MB**; the limit is not 20 MB per file. Add larger folders in batches. If your phone’s browser cannot select a whole folder, select multiple files instead.

#### Edit an Existing Song

1. Select **更新已有曲目** (“Update an existing song”).
2. Select Update an existing song beside the heading, then search the entire library or browse a semester’s Google Drive folder. Scroll through the results and select a song to open its details; the original semester is filled in automatically.
3. Edit the title, arrangers, type, or destination semester. You can also add files and select existing files to delete.
4. Select **Save** to apply your changes. Canceling exits without saving.

Edits affect the shared library, not just your own view. Arrangers can currently edit existing songs in the library, including songs uploaded by others. Follow the club’s agreed practices.

<a id="management"></a>
## Administrators and Music Directors

<a id="roles"></a>
### Roles and Permissions

Roles can be combined; a member can be both a Music Director and an Arranger.

 | Role | Permissions | 
| --- | --- |
 | Regular member | Edit your own profile, browse members and scores, participate in solo selection, and vote. | 
 | Arranger | Upload and edit scores; view results for a round when assigned as its arranger. | 
 | Music Director | Assign Arrangers, open and end rounds, view results for all rounds, and delete rounds. | 
 | Administrator `admin` | Set member roles and Active/Alumni status, manage regular member accounts, configure the Google score library, and end or delete rounds. | 
 | President、Vice President、Secretary、Treasurer、Media Chair | Board position labels in the roster; these alone do not grant upload or voting management permissions. | 

`admin` is an administrative account, not your personal member account. Register under your own name first, then use `admin` to assign Music Director / Arranger roles to your personal account. The administrator password is kept by the person in charge and is not included in this public README.

<a id="manage-members"></a>
### Assign Roles and Manage Members

1. Sign in as an administrator and open **Members**.
2. Select the role editing button, then select a member’s name to expand their settings.
3. Select Music Director, Arranger, or other positions, and set Active / Alumni status.
4. Save your changes, or cancel to discard them.

Music Directors can assign Arrangers through the member roster, but cannot assign Music Directors or other board positions. Changing a member to Alumni clears their Music Director, Arranger, and other current position labels.

Administrators can also change a regular member’s username, enter a new password, or delete the account in the expanded settings. Leave the new password blank to keep the existing password. Resetting a password invalidates existing sign-in sessions. Deleting a member removes related candidacy and voting data, so check the account first. This interface cannot edit or delete `admin` itself.

<a id="rounds"></a>
### Manage Voting Rounds

1. Sign in with your personal Music Director account and open **Solo voting**.
2. If no round is active, enter a round name and select its Arranger.
3. The Arranger must be an Active member with the Arranger role. If the dropdown is empty, assign the role in the member roster first.
4. Open the round so members can participate and vote.
5. Select the end-round button and confirm when finished. The hosted version allows only Music Directors or administrators to end a round, even if another member sees the button.
6. View historical results. To remove a test round, select delete in the round management area and confirm.

**Ending** a round preserves its results. **Deleting** removes the entire round, its candidates, and votes. End official selection rounds to keep their results.

<a id="faq"></a>
## FAQ

 | Issue | What to Do | 
| --- | --- |
 | Which link should I use? | Use the **Website** link at the top. GitHub stores the code; `localhost` refers to the developer’s own computer. | 
 | Username already exists | Sign in with your existing account, or contact an administrator if you forgot the password. No new registration is needed. | 
 | I am an MD but cannot upload | You also need the Arranger role, and the Google score library must be configured. | 
 | Score library is not configured | Ask an administrator to connect Google, set the index sheet and root folder, and add a semester. | 
 | No Arranger is available for a round | Assign the Arranger role to at least one Active member first. | 
 | I cannot see vote totals | Regular members see only their own choices. Totals are available to MDs and the round’s assigned Arranger. | 
 | No active round | Wait for an MD to open a round. An active round must end before the next can begin. | 
 | Upload fails or request is too large | Check that the total upload is under 20 MB, you have the required role, and the Google connection is valid. | 
 | Drive access is denied | Check your Google account and the folder’s sharing permissions. Website accounts do not replace Google permissions. | 
 | Votes or profiles do not update immediately | Check that the action succeeded, then wait a few seconds. Data refreshes periodically; refresh manually if needed. | 

<a id="google-setup"></a>
## Initial Google Score Library Setup

Only administrators need to complete this setup. Regular members do not need to authorize the Google APIs individually.

### Prepare the Shared Folder and Index Sheet

1. Prepare the club’s root score folder in Google Drive and copy its link.
2. Prepare a Google Sheets index and copy its link.
3. The club Google account connected to the website must have editing access to both.
4. Set the following headers in the first row of the **first worksheet**:

 | A | B | C | D | E | 
| --- | --- | --- | --- | --- |
 | 曲名Song Title | 编曲Arranger | 学期Semester | 性质Type | 链接Link | 

If the first row is empty, the first successful upload inserts these headers automatically. Using all five headers helps keep the index complete.

### Create a Google OAuth Client

1. Open [Google Cloud Console](https://console.cloud.google.com/) and select or create the club’s project.
2. Enable the **Google Drive API** and **Google Sheets API**.
3. Follow Google Auth Platform’s setup for the app name, contact email, and audience. If the project is in testing mode, add the club Google account to **Test users**.
4. Create an OAuth client of type **Web application**.
5. Add this exact address under **Authorized redirect URIs**:

```text
https://acappella-hub.elenazhang0607.chatgpt.site/api/google/callback
```

6. Keep the Client ID and Client Secret. Enter the Client Secret only in the website’s administrator settings; do not upload it to GitHub.

Official Google references: [Enable Workspace APIs](https://developers.google.com/workspace/guides/enable-apis) · [Web Server OAuth Setup](https://developers.google.com/identity/protocols/oauth2/web-server).

### Complete the Connection on the Website

1. Sign in as `admin` and open **Scores → Score settings**.
2. Enter the Client ID, Client Secret, index sheet link, and root folder link.
3. Select **Save settings**. When editing other settings later, leave Client Secret blank to keep the saved secret.
4. Select **Connect Google account**, choose the club account, and authorize access.
5. Return to the website and confirm that the connected email address is displayed.
6. Enter a semester name, such as `2026 Fall`, and select **Add semester**. The system creates its folder under the root folder.
7. Assign the Arranger role to members who need to upload, then test with a small file and check the index entry.

Uploading becomes available after Google is connected, the index sheet is set, and at least one semester exists. Connecting Google does not automatically give members access to Drive files; configure the club folder’s sharing permissions separately.

<a id="setup-tips"></a>
### Setup Tips

- **Google shows `redirect_uri_mismatch`:** Check that the OAuth client’s redirect URI exactly matches the full HTTPS address above.
- **Google connection stops working:** An administrator should reconnect and check the Google project’s audience, test users, and authorization status.

<a id="changes"></a>
## Future Website Changes

GitHub stores the source code and change history. Sites hosts the version everyone uses. A GitHub commit does not automatically update the live website.

For changes, tell ChatGPT: **“Please change …, sync GitHub, and publish to the existing website.”** Editing code, committing to GitHub, checking the build, and publishing are separate steps. The website keeps the same URL after publishing. README-only changes do not require republishing.

---

<a id="development"></a>
## Development and Hosting

The following sections are for code maintainers. Members do not need to run commands for everyday use.

<a id="local"></a>
### Run Locally

Requires Node.js 22 or newer.

```sh
npm start
```

Open `http://127.0.0.1:4173` on the computer running the app. Other devices on the same network can use the network address printed in the terminal.

<a id="private-data"></a>
### Private Data

Local runtime data is stored in `data/` and intentionally excluded from Git. This includes accounts, password hashes, sessions, votes, avatars, and Google OAuth configuration.

<a id="hosting"></a>
### Hosted Sites Version

The original Node server remains in `server.js`. The hosted version lives in `worker/`: the original UI is bundled from `public/`, shared records are stored in D1, and avatars and private Google configuration are stored in R2.

- `npm run build:hosted` builds the Worker.
- `npm run check:hosted` checks account, role, voting, result visibility, avatar, deletion, and Google configuration flows in the Worker runtime.
- `.openai/hosting.json` retains the Site identity and logical storage bindings.
- Make schema changes in `db/schema.ts` and generate incremental migrations with `npm run db:generate`. Do not rewrite published migration files.
- Before first API use, configure `ADMIN_PASSWORD` as a hosted secret and `PUBLIC_ORIGIN` as the canonical HTTPS Site origin. Never write administrator passwords into source or deployment logs. Changing the initialization secret does not reset an existing account.
- Hosted accounts use PBKDF2 password hashes and session cookies with Secure, HttpOnly, and SameSite=Lax attributes.
- The ZIP source did not include existing accounts, votes, avatars, or Google credentials. The hosted installation initially used a new database and requires administrator setup and Google consent from the club account.
- Google Cloud must allow `<PUBLIC_ORIGIN>/api/google/callback`, with Drive and Sheets APIs enabled. Keep client secrets inside administrator settings only.
- Hosted multipart uploads are limited to **20 MB total per request** to stay within the Worker memory budget. Split larger folders into smaller batches.
- Browser UI and WebMCP validation were unavailable in the managed preview for this Worker-only project; API flows were checked in the Worker runtime.
- Sites hosting is currently included in eligible ChatGPT plans during public beta, with plan usage limits. This is not a guarantee of permanent free hosting.

Live site: [A Cappella Hub](https://acappella-hub.elenazhang0607.chatgpt.site)

`worker/assets.js` is generated by the hosted build from `public/` and is not tracked in this repository. GitHub commits do not automatically redeploy Sites; publish the updated source to the existing Site when you want it to go live.
