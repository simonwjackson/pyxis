use std::process::{Child, Command, Stdio};
use std::thread;
use std::time::Duration;

struct ChildGuard(Child);

impl Drop for ChildGuard {
    fn drop(&mut self) {
        let _ = self.0.kill();
        let _ = self.0.wait();
    }
}

#[test]
fn a_second_server_process_cannot_open_the_same_store() {
    let dir = tempfile::tempdir().expect("temp dir");
    let binary = env!("CARGO_BIN_EXE_pyxis");

    let first = Command::new(binary)
        .arg("--state-dir")
        .arg(dir.path())
        .arg("--port")
        .arg("0")
        .env("PYXIS_LOG", "off")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .expect("start first server");
    let mut first = ChildGuard(first);

    for _ in 0..100 {
        if first.0.try_wait().expect("poll first").is_some() {
            panic!("first server exited before acquiring its instance lock");
        }
        if dir.path().join("instance.lock").is_file() {
            break;
        }
        thread::sleep(Duration::from_millis(10));
    }
    assert!(dir.path().join("instance.lock").is_file());
    thread::sleep(Duration::from_millis(50));

    let second = Command::new(binary)
        .arg("--state-dir")
        .arg(dir.path())
        .arg("--port")
        .arg("0")
        .env("PYXIS_LOG", "off")
        .output()
        .expect("start second server");

    assert!(!second.status.success());
    assert!(
        String::from_utf8_lossy(&second.stderr).contains("another Pyxis server owns"),
        "unexpected stderr: {}",
        String::from_utf8_lossy(&second.stderr)
    );
}
