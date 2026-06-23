import { useParams, Outlet } from 'react-router-dom';
import { ActiveTeamContext } from '@/context/ActiveTeamContext';

export default function TeamManage() {
  const { teamId } = useParams<{ teamId: string }>();

  return (
    <ActiveTeamContext.Provider value={{ teamId: teamId ?? null }}>
      <Outlet />
    </ActiveTeamContext.Provider>
  );
}
