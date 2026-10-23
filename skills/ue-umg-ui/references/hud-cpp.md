# HUD en C++ sin diseñador (UE 5.x)

Vía comprobada para workers sin GUI: el widget construye su árbol en código, el controlador lo
crea y enlaza la tecla. Sustituye `Juego` por el nombre del módulo.

## Build.cs

```csharp
PublicDependencyModuleNames.AddRange(new[] { "Core", "CoreUObject", "Engine", "InputCore", "UMG", "Slate", "SlateCore" });
```

Proyecto solo Blueprint: añade `Source/Juego/{Juego.Build.cs, Juego.cpp, Juego.h}`,
`Source/{Juego.Target.cs, JuegoEditor.Target.cs}` y en el `.uproject`
`"Modules": [{"Name": "Juego", "Type": "Runtime", "LoadingPhase": "Default"}]`.

## Widget

```cpp
// JuegoVidaWidget.h
UCLASS()
class JUEGO_API UJuegoVidaWidget : public UUserWidget {
  GENERATED_BODY()
public:
  void SetVida(float Fraccion);
protected:
  virtual TSharedRef<SWidget> RebuildWidget() override;
private:
  UPROPERTY() TObjectPtr<UProgressBar> Barra;
};

// JuegoVidaWidget.cpp
TSharedRef<SWidget> UJuegoVidaWidget::RebuildWidget() {
  if (WidgetTree && !WidgetTree->RootWidget) {
    UCanvasPanel* Raiz = WidgetTree->ConstructWidget<UCanvasPanel>(UCanvasPanel::StaticClass(), TEXT("Raiz"));
    WidgetTree->RootWidget = Raiz;
    Barra = WidgetTree->ConstructWidget<UProgressBar>(UProgressBar::StaticClass(), TEXT("Vida"));
    UCanvasPanelSlot* Slot = Raiz->AddChildToCanvas(Barra);
    Slot->SetAnchors(FAnchors(0, 0));            // esquina superior izquierda (dirección de arte)
    Slot->SetPosition(FVector2D(48, 48));         // margen seguro a 1080p
    Slot->SetSize(FVector2D(320, 24));
    Barra->SetFillColorAndOpacity(FLinearColor::FromSRGBColor(FColor::FromHex(TEXT("4CD38A"))));
    Barra->SetPercent(1.f);
  }
  return Super::RebuildWidget();
}
void UJuegoVidaWidget::SetVida(float Fraccion) { if (Barra) Barra->SetPercent(FMath::Clamp(Fraccion, 0.f, 1.f)); }
```

## Controlador y tecla

```cpp
void AJuegoPlayerController::BeginPlay() {
  Super::BeginPlay();
  if (IsLocalController() && !Hud) { Hud = CreateWidget<UJuegoVidaWidget>(this, UJuegoVidaWidget::StaticClass()); Hud->AddToViewport(); }
}
void AJuegoPlayerController::SetupInputComponent() {
  Super::SetupInputComponent();
  InputComponent->BindKey(EKeys::H, IE_Pressed, this, &AJuegoPlayerController::Herir);
}
void AJuegoPlayerController::Herir() { Vida = FMath::Max(0.f, Vida - 10.f); if (Hud) Hud->SetVida(Vida / VidaMaxima); }
```

Un `AGameModeBase` propio con `PlayerControllerClass = AJuegoPlayerController::StaticClass()` y
`GlobalDefaultGameMode=/Script/Juego.JuegoGameMode` en `Config/DefaultEngine.ini`
(`[/Script/EngineSettings.GameMapsSettings]`) hacen que cualquier mapa lo use al jugar.

## Errores frecuentes

- `LNK2019` con `UProgressBar`: falta `"UMG"` en `Build.cs`.
- El HUD no aparece en `-game`: el GameMode por defecto no es el tuyo (revisa `DefaultEngine.ini`
  y el GameMode override del mapa).
- Doble HUD tras reiniciar el nivel: crea el widget solo si `Hud` es nulo.
