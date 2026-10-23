import * as nodeFs from 'node:fs';
import { win32 } from 'node:path';
export type Capability = {
    id: string;
    label: string;
    state: 'ausente' | 'detectado' | 'comprobado' | 'roto';
    detail: string;
};
type FileSystem = {
    existsSync: (path: string) => boolean;
    readFileSync: (path: string, encoding: any) => any;
};
export function detectCapabilities(env: NodeJS.ProcessEnv = process.env, fs: FileSystem = nodeFs): Capability[] {
    let config: {
        unrealPath?: string;
        blenderPath?: string;
    } = {};
    try {
        const value = JSON.parse(fs.readFileSync('.kratos/config.json', 'utf8'));
        if (value && typeof value === 'object')
            config = value;
    }
    catch { /* Configuración opcional. */ }
    const exists = (p: string) => { try {
        return fs.existsSync(p);
    }
    catch {
        return false;
    } };
    const onPath = (exe: string) => (env.PATH ?? env.Path ?? '').split(';').some(p => exists(p.replace(/[/\\]$/, '') + '/' + exe) || exists(win32.join(p, exe)));
    const unreal = typeof config.unrealPath === 'string' ? config.unrealPath : 'C:\\Program Files\\Epic Games\\UE_5.8\\Engine\\Binaries\\Win64\\UnrealEditor-Cmd.exe';
    const engine = win32.resolve(win32.dirname(unreal), '../..');
    const plugin = (relative: string) => exists(win32.join(engine, 'Plugins', relative));
    const launcher = [env.ProgramFiles ?? 'C:\\Program Files', env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)']
        .some(root => ['Win64', 'Win32'].some(arch => exists(win32.join(root, 'Epic Games/Launcher/Portal/Binaries', arch, 'EpicGamesLauncher.exe'))));
    const values: [
        string,
        string,
        boolean,
        string
    ][] = [
        ['node', 'Node.js', Number(process.versions.node.split('.')[0]) >= 25, 'Node.js ' + process.versions.node],
        ['unreal', 'Unreal Engine', exists(unreal), 'Editor de Unreal'],
        ['unreal_mcp', 'Unreal MCP', plugin('Experimental/ModelContextProtocol/ModelContextProtocol.uplugin') && plugin('Experimental/Toolsets/AllToolsets/AllToolsets.uplugin'), 'Plugins MCP y herramientas'],
        ['fab_plugin', 'Fab', plugin('Fab/Fab.uplugin'), 'Plugin Fab'], ['launcher', 'Epic Games Launcher', launcher, 'Launcher de Epic Games'],
        ['meshy', 'Meshy', Boolean(env.MESHY_API_KEY), 'Configuración de API'],
        ['blender', 'Blender', typeof config.blenderPath === 'string' ? exists(config.blenderPath) : onPath('blender.exe') || onPath('blender'), 'Ejecutable de Blender'],
        ['git', 'Git', onPath('git.exe') || onPath('git'), 'Ejecutable de Git']
    ];
    return values.map(([id, label, found, detail]) => ({ id, label, state: found ? 'detectado' : 'ausente', detail: detail + (found ? ' detectado' : ' ausente') }));
}
