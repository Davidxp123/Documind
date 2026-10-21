import WorkspacePage from './WorkspaceClient';

export function generateStaticParams() {
  return [{ workspaceId: 'default' }];
}

export const dynamicParams = false;

export default function Page() {
  return <WorkspacePage />;
}
