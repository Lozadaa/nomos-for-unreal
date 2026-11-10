using UnrealBuildTool;

public class Semilla : ModuleRules
{
	public Semilla(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;
		PublicDependencyModuleNames.AddRange(new string[] { "Core", "CoreUObject", "Engine", "InputCore", "EnhancedInput",
			"UMG", "Slate", "SlateCore", "Niagara", "PhysicsCore" });
	}
}
