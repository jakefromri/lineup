import { createContext } from 'react';

export const ActiveTeamContext = createContext<{ teamId: string | null }>({ teamId: null });
