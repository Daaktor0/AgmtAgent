# Setup — Windows + Microsoft Word

About fifteen minutes, once.

## Before you start

You need two things:

1. **Python 3.10 or newer.** Get it from <https://python.org/downloads>. During
   install, tick **"Add python.exe to PATH"**.
2. **An OpenRouter API key.** Sign up at <https://openrouter.ai>, then
   <https://openrouter.ai/keys>, and add some credit.

> A ChatGPT Plus, Claude Pro or SuperGrok **subscription will not work here.**
> Those are consumer chat products; they have no programmatic access. An API key
> is a separate paid thing. OpenRouter gives you one key that reaches Claude,
> GPT, Gemini, Grok and several hundred other models, so you only manage one.

## 1. Unzip

Put the folder somewhere permanent — `C:\AgreementAgent` is fine. Not in
Downloads, and not inside OneDrive (the file share in step 2 gets confused).

## 2. Run setup

Right-click **`setup.ps1`** → **Run with PowerShell**. If Windows blocks it, open
PowerShell and run:

```powershell
cd C:\AgreementAgent
powershell -ExecutionPolicy Bypass -File .\setup.ps1
```

It will ask for administrator rights. It needs them to trust the localhost
certificate (Word will not load an add-in over plain HTTP) and to share the
folder Word reads the add-in from. Nothing is sent anywhere during setup.

When it finishes it prints a path like `\\YOUR-PC\AgreementAgent`. That path is
also written to `CATALOG-PATH.txt`.

## 3. Tell Word to trust that folder

In Word:

**File → Options → Trust Center → Trust Center Settings… → Trusted Add-in Catalogs**

- Paste the `\\YOUR-PC\AgreementAgent` path into **Catalog Url**
- Click **Add catalog**
- Tick **Show in Menu** next to it
- **OK**, **OK**
- **Close Word completely and reopen it.** It will not appear otherwise.

## 4. Start the agent

Right-click **`start.ps1`** → **Run with PowerShell**. Leave that window open
while you work; closing it stops the agent.

You should see:

```
Agreement Agent running at https://localhost:8787
```

## 5. Insert the add-in

In Word: **Home → Add-ins → Advanced** (older builds: **More Add-ins**) →
**SHARED FOLDER** tab → **Agreement Agent** → **Add**.

The pane opens on the right. Word remembers it, so next time it is just a button
on the Home tab.

## 6. Add your key

In the pane: **Settings → API key → Save key**. Then pick your models, or leave
every role on **auto**.

---

## If something goes wrong

**"Can't reach the local agent"** — `start.ps1` isn't running, or the
certificate wasn't accepted. Open <https://localhost:8787/taskpane.html> in Edge
once. If you get a certificate warning, setup's trust step didn't take: re-run
`setup.ps1` as administrator.

**The add-in isn't in the SHARED FOLDER list** — you didn't fully restart Word
after adding the catalog, or the path you pasted was the local path
(`C:\AgreementAgent\catalog`) rather than the network path
(`\\YOUR-PC\AgreementAgent`). It must be the `\\` one.

**"Trusted Add-in Catalogs" isn't in the Trust Center** — your organisation has
locked it down by group policy. Ask IT to deploy the add-in through the
Microsoft 365 admin centre instead; hand them `addin\manifest.xml`, and change
the three `localhost:8787` URLs in it to wherever they host it.

**Certificate expired** — it lasts about two years. Delete the `certs` folder and
re-run `setup.ps1`.

**Word says the pane is blank** — check the `start.ps1` window for a Python
error, and confirm no other program is using port 8787. You can change the port
in `config.yaml`, but then you must also change it in `addin\manifest.xml` (five
places) and re-copy the manifest to the `catalog` folder.

## Moving it to another machine

Copy the whole folder, delete `.venv`, `certs` and `config.yaml`, and run
`setup.ps1` there. The certificate is machine-specific.
