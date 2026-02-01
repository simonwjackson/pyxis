import {
	createContext,
	useContext,
	useState,
	useEffect,
	useCallback,
	type ReactNode,
} from "react";
import { trpc } from "../lib/trpc";

type AuthState = {
	authenticated: boolean;
	username: string | undefined;
	isLoading: boolean;
	login: (username: string, password: string) => Promise<void>;
	logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
	const [sessionId, setSessionId] = useState<string | undefined>(() => {
		if (typeof window !== "undefined") {
			return localStorage.getItem("pyxis_session") ?? undefined;
		}
		return undefined;
	});

	const statusQuery = trpc.auth.status.useQuery(undefined, {
		retry: false,
		refetchOnWindowFocus: false,
	});

	const loginMutation = trpc.auth.login.useMutation();
	const logoutMutation = trpc.auth.logout.useMutation();

	const login = useCallback(
		async (username: string, password: string) => {
			const result = await loginMutation.mutateAsync({
				username,
				password,
			});
			setSessionId(result.sessionId);
			localStorage.setItem("pyxis_session", result.sessionId);
			document.cookie = `pyxis_session=${result.sessionId}; path=/; SameSite=Lax`;
			statusQuery.refetch();
		},
		[loginMutation, statusQuery],
	);

	const logout = useCallback(async () => {
		await logoutMutation.mutateAsync();
		setSessionId(undefined);
		localStorage.removeItem("pyxis_session");
		document.cookie =
			"pyxis_session=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
		statusQuery.refetch();
	}, [logoutMutation, statusQuery]);

	useEffect(() => {
		if (sessionId) {
			document.cookie = `pyxis_session=${sessionId}; path=/; SameSite=Lax`;
		}
	}, [sessionId]);

	return (
		<AuthContext.Provider
			value={{
				authenticated: statusQuery.data?.authenticated ?? false,
				username: statusQuery.data?.username,
				isLoading: statusQuery.isLoading,
				login,
				logout,
			}}
		>
			{children}
		</AuthContext.Provider>
	);
}

export function useAuth() {
	const context = useContext(AuthContext);
	if (!context) {
		throw new Error("useAuth must be used within an AuthProvider");
	}
	return context;
}
