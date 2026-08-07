import {
  createContext,
  useContext,
  type ReactNode,
} from "react";

export type StudentSessionUser = {
  id?: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
  roles?: string[];
  [key: string]: unknown;
};

export type StudentSession = {
  user?: StudentSessionUser;
};

export type StudentSessionStatus =
  | "loading"
  | "authenticated"
  | "unauthenticated";

type StudentSessionContextValue = {
  data: StudentSession | null;
  status: StudentSessionStatus;
};

const StudentSessionContext =
  createContext<StudentSessionContextValue>({
    data: null,
    status: "loading",
  });

export function StudentSessionProvider(props: {
  session: StudentSession | null;
  children: ReactNode;
}) {
  return (
    <StudentSessionContext.Provider
      value={{
        data: props.session,
        status: props.session
          ? "authenticated"
          : "unauthenticated",
      }}
    >
      {props.children}
    </StudentSessionContext.Provider>
  );
}

export function useStudentSession() {
  return useContext(StudentSessionContext);
}
