import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { defaultAppearance } from '../appearance'
import type { Appearance } from '../appearance'

export function AppearanceDialog({
  value,
  onChange,
  error,
  onClose,
}: {
  value: Appearance
  onChange: (value: Appearance) => void
  error: string
  onClose: () => void
}) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Preferências de aparência</DialogTitle>
          <DialogDescription>
            As mudanças são aplicadas agora e ficam guardadas neste navegador.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="appearance-theme">Tema</Label>
            <Select
              value={value.theme}
              onValueChange={(theme: Appearance['theme']) =>
                onChange({ ...value, theme })
              }
            >
              <SelectTrigger id="appearance-theme" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="light">Claro</SelectItem>
                <SelectItem value="dark">Escuro</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="appearance-size">Tamanho do texto</Label>
            <Select
              value={String(value.fontSize)}
              onValueChange={(size) =>
                onChange({
                  ...value,
                  fontSize: Number(size) as Appearance['fontSize'],
                })
              }
            >
              <SelectTrigger id="appearance-size" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[14, 16, 18, 20].map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size} px
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Ajusta a leitura e o texto do editor. A interface mantém seu
              tamanho.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="appearance-width">Largura do documento</Label>
            <Select
              value={value.width}
              onValueChange={(width: Appearance['width']) =>
                onChange({ ...value, width })
              }
            >
              <SelectTrigger id="appearance-width" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="comfortable">Confortável</SelectItem>
                <SelectItem value="wide">Ampla</SelectItem>
                <SelectItem value="full">Toda a largura</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-1">
              <Label htmlFor="appearance-motion">Animações</Label>
              <p
                id="motion-description"
                className="text-xs text-muted-foreground"
              >
                A preferência de reduzir movimento do sistema tem prioridade.
              </p>
            </div>
            <Switch
              id="appearance-motion"
              checked={value.animations}
              onCheckedChange={(animations) =>
                onChange({ ...value, animations })
              }
              aria-describedby="motion-description"
            />
          </div>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Button variant="outline" onClick={() => onChange(defaultAppearance)}>
            Restaurar padrão
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
