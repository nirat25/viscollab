import { getDocuments, saveDocuments, getUsers, getWorkspaces, saveWorkspaces } from "../src/app/api/collab/db";

async function main() {
  const users = await getUsers();
  const admins = users.filter(u => u.role === 'admin');
  const firstAdmin = admins.length > 0 ? admins[0].username : (users.length > 0 ? users[0].username : 'admin');

  console.log('Using admin:', firstAdmin);

  const workspaces = await getWorkspaces();
  let defaultWs = workspaces.find(w => w.id === 'ws-default');
  if (!defaultWs) {
    defaultWs = {
      id: 'ws-default',
      name: 'Default Workspace',
      members: [{ username: firstAdmin, role: 'admin' }]
    };
    workspaces.push(defaultWs);
    await saveWorkspaces(workspaces);
    console.log('Created default workspace');
  } else {
    console.log('Default workspace already exists');
  }

  const docs = await getDocuments();
  let modified = false;
  for (const doc of docs) {
    if (!doc.workspaceId) {
      doc.workspaceId = 'ws-default';
      modified = true;
    }
  }

  if (modified) {
    await saveDocuments(docs);
    console.log('Migrated documents to default workspace');
  } else {
    console.log('No documents needed migration');
  }
}

main().catch(console.error);
