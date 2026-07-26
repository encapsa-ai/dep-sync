use crate::config::Settings;
use std::{path::Path, process::Command};

#[cfg(target_os = "linux")]
use std::{env, path::PathBuf};

pub fn open(path: &Path, settings: &Settings) -> Result<(), String> {
    if !settings.terminal_command.trim().is_empty() {
        return open_custom(path, &settings.terminal_command);
    }

    #[cfg(target_os = "macos")]
    {
        open_macos(path)
    }

    #[cfg(target_os = "linux")]
    {
        open_linux(path)
    }

    #[cfg(not(any(target_os = "macos", target_os = "linux")))]
    {
        let _ = path;
        Err("Open Terminal is supported on macOS and Linux".to_string())
    }
}

fn open_custom(path: &Path, template: &str) -> Result<(), String> {
    let parts = shell_words::split(template)
        .map_err(|error| format!("Could not parse terminal_command: {error}"))?;
    let (program, arguments) = parts
        .split_first()
        .ok_or_else(|| "terminal_command is empty".to_string())?;
    let path_text = path.display().to_string();
    let has_placeholder = arguments.iter().any(|argument| argument.contains("{path}"));
    let mut command = Command::new(program);
    command.args(
        arguments
            .iter()
            .map(|argument| argument.replace("{path}", &path_text)),
    );
    if !has_placeholder {
        command.arg(path);
    }
    command
        .current_dir(path)
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("Could not launch terminal command '{template}': {error}"))
}

#[cfg(target_os = "macos")]
fn open_macos(path: &Path) -> Result<(), String> {
    let command = format!("cd {}", shell_quote(path));
    let escaped_command = command.replace('\\', "\\\\").replace('"', "\\\"");
    let script = if Path::new("/Applications/iTerm.app").exists() {
        iterm_script(&escaped_command)
    } else {
        terminal_script(&escaped_command)
    };
    let status = Command::new("osascript")
        .arg("-e")
        .arg(script)
        .status()
        .map_err(|error| format!("Could not open a terminal at {}: {error}", path.display()))?;
    if status.success() {
        Ok(())
    } else {
        Err(format!(
            "The terminal application could not open a session at {}",
            path.display()
        ))
    }
}

#[cfg(target_os = "macos")]
fn iterm_script(escaped_command: &str) -> String {
    format!(
        "tell application \"iTerm\"\nactivate\nset newWindow to (create window with default profile)\ntell current session of newWindow to write text \"{escaped_command}\"\nend tell"
    )
}

#[cfg(target_os = "macos")]
fn terminal_script(escaped_command: &str) -> String {
    format!("tell application \"Terminal\"\nactivate\ndo script \"{escaped_command}\"\nend tell")
}

#[cfg(target_os = "linux")]
fn open_linux(path: &Path) -> Result<(), String> {
    if let Ok(template) = env::var("TERMINAL") {
        if !template.trim().is_empty() {
            if let Ok(result) = open_custom(path, &template) {
                return Ok(result);
            }
        }
    }

    let path_text = path.display().to_string();
    let candidates: Vec<(&str, Vec<String>)> = vec![
        ("x-terminal-emulator", vec![]),
        (
            "gnome-terminal",
            vec![format!("--working-directory={path_text}")],
        ),
        ("konsole", vec!["--workdir".to_string(), path_text.clone()]),
        (
            "alacritty",
            vec!["--working-directory".to_string(), path_text.clone()],
        ),
        ("kitty", vec!["--directory".to_string(), path_text.clone()]),
    ];

    for (program, args) in candidates {
        if executable_path(program).is_some() {
            return Command::new(program)
                .args(args)
                .current_dir(path)
                .spawn()
                .map(|_| ())
                .map_err(|error| format!("Could not launch {program}: {error}"));
        }
    }

    if executable_path("xterm").is_some() {
        let shell = env::var("SHELL").unwrap_or_else(|_| "/bin/sh".to_string());
        return Command::new("xterm")
            .args(["-e", &shell])
            .current_dir(path)
            .spawn()
            .map(|_| ())
            .map_err(|error| format!("Could not launch xterm: {error}"));
    }

    Err(
        "No supported terminal emulator was found. Set terminal_command in config.toml."
            .to_string(),
    )
}

#[cfg(target_os = "linux")]
fn executable_path(program: &str) -> Option<PathBuf> {
    let path = env::var_os("PATH")?;
    env::split_paths(&path)
        .map(|directory| directory.join(program))
        .find(|candidate| candidate.is_file())
}

#[cfg(target_os = "macos")]
fn shell_quote(path: &Path) -> String {
    let value = path.display().to_string();
    format!("'{}'", value.replace('\'', "'\"'\"'"))
}

#[cfg(all(test, target_os = "macos"))]
mod tests {
    use super::*;

    #[test]
    fn iterm_opens_a_shell_before_changing_directories() {
        let command = format!("cd {}", shell_quote(Path::new("/tmp/project with spaces")));
        let escaped = command.replace('\\', "\\\\").replace('"', "\\\"");
        let script = iterm_script(&escaped);

        assert!(script.contains("create window with default profile)"));
        assert!(script.contains("current session of newWindow to write text"));
        assert!(script.contains("cd '/tmp/project with spaces'"));
        assert!(!script.contains("profile command"));
    }
}
