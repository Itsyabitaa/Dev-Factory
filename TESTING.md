# Testing Guide - Sprint 2 (Command Runner)

This guide outlines how to verify the Command Runner engine and the built-in terminal UI.

## 1. Prerequisites
- **Node.js**: v18+ recommended.
- **PHP/Composer**: (Optional) Required to test those specific buttons.

## 2. Launching the App
Run the following command in the project root:
```bash
npm start
```
This will:
1. Compile the TypeScript source code into the `dist/` folder.
2. Launch the Electron application.

## 3. Verification Checklist

### ✅ Command Execution
- [ ] Click **"Run Node Check"**: Verify it prints `node -v` output (e.g., `v22.3.0`).
- [ ] Click **"NPM Check"**: Verify it prints `npm -v` output.
- [ ] Click **"PHP Check"**: Verify it prints `php -v` (if installed).
- [ ] Click **"Composer Check"**: Verify it prints `composer -V` (if installed).

### ✅ Live Streaming
- [ ] Observe that logs appear **live** as they are generated, not all at once at the end.

### ✅ Cancellation
- [ ] Run a command that takes logic (or just quickly click cancel on one).
- [ ] Click **"Cancel Signal"**.
- [ ] Verify the terminal shows `[Cancellation requested]` and the process stops.

### ✅ Exit Status
- [ ] Verify that after a command finishes, it prints:
  `[Process exited with code 0 in Xms]`
- [ ] (Advanced) Try running a command that fails to see the error handling.

### ✅ UI Polish
- [ ] Verify the console is scrollable.
- [ ] Click **"Clear Console"** to verify it resets the terminal view.

## 4. Troubleshooting
- If `npm start` hangs on compilation, try running `npx tsc` manually to see if there are specific errors.
- Ensure `node_modules` is fully installed (`npm install`).
