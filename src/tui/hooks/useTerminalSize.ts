import { useStdout } from "ink";

type TerminalSize = {
	readonly columns: number;
	readonly rows: number;
	readonly isSmall: boolean; // columns < 80
	readonly isMedium: boolean; // 80 <= columns < 120
	readonly isLarge: boolean; // columns >= 120
};

export const useTerminalSize = (): TerminalSize => {
	const { stdout } = useStdout();
	const columns = stdout?.columns ?? 80;
	const rows = stdout?.rows ?? 24;

	return {
		columns,
		rows,
		isSmall: columns < 80,
		isMedium: columns >= 80 && columns < 120,
		isLarge: columns >= 120,
	};
};
