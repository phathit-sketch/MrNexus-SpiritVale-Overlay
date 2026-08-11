import { appendFileSync } from "node:fs";
import { join } from "node:path";
import { logsDirectory } from "./runtime-config";
import { APP_VERSION } from "./version";

export const DEBUG = false;

export type LogLevel = "INFO" | "WARN" | "ERROR" | "DEBUG";

function logDirectory(): string {
    return logsDirectory();
}

function logFile(): string {
    const now = new Date();

    const file =
        now.getFullYear() +
        "-" +
        String(now.getMonth() + 1).padStart(2, "0") +
        "-" +
        String(now.getDate()).padStart(2, "0") +
        ".log";

    return join(logDirectory(), file);
}

function write(level: LogLevel, message: string) {
    if (level === "DEBUG" && !DEBUG) {
        return;
    }

    const now = new Date();

    const time =
        String(now.getHours()).padStart(2, "0") +
        ":" +
        String(now.getMinutes()).padStart(2, "0") +
        ":" +
        String(now.getSeconds()).padStart(2, "0");

    appendFileSync(
        logFile(),
        `[${time}] [${level}] ${message}\r\n`,
        "utf8"
    );
}

export const logger = {
    info(msg: string) {
        write("INFO", msg);
    },

    warn(msg: string) {
        write("WARN", msg);
    },

    error(msg: string) {
        write("ERROR", msg);
    },

    debug(msg: string) {
        write("DEBUG", msg);
    },

    startup() {
        write(
            "INFO",
            `SpiritVale Drops Overlay v${APP_VERSION} started`
        );

        write(
            "INFO",
            `Platform=${process.platform} Node=${process.version}`
        );
    },

    shutdown() {
        write(
            "INFO",
            "Overlay closed"
        );
    },

    exception(err: unknown) {
        write(
            "ERROR",
            err instanceof Error
                ? err.stack ?? err.message
                : String(err)
        );
    }
};