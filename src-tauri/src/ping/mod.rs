pub mod command;
pub mod parser;

pub use command::ping_target;
pub use parser::{parse_ping_output, ParsedPing};
