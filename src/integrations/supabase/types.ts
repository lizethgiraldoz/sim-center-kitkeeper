export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      activities: {
        Row: {
          default_duration_minutes: number
          description: string | null
          id: string
          name: string
        }
        Insert: {
          default_duration_minutes?: number
          description?: string | null
          id?: string
          name: string
        }
        Update: {
          default_duration_minutes?: number
          description?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      activity_checklists: {
        Row: {
          activity_id: string | null
          cantidad: number | null
          cantidad_texto: string | null
          dia: string
          estacion: string | null
          excluido: boolean
          id: string
          item: string
          modulo: string
          motivo_exclusion: string | null
          orden: number
        }
        Insert: {
          activity_id?: string | null
          cantidad?: number | null
          cantidad_texto?: string | null
          dia: string
          estacion?: string | null
          excluido?: boolean
          id?: string
          item: string
          modulo: string
          motivo_exclusion?: string | null
          orden?: number
        }
        Update: {
          activity_id?: string | null
          cantidad?: number | null
          cantidad_texto?: string | null
          dia?: string
          estacion?: string | null
          excluido?: boolean
          id?: string
          item?: string
          modulo?: string
          motivo_exclusion?: string | null
          orden?: number
        }
        Relationships: [
          {
            foreignKeyName: "activity_checklists_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_resource_templates: {
        Row: {
          activity_id: string
          id: string
          quantity: number
          resource_id: string
        }
        Insert: {
          activity_id: string
          id?: string
          quantity: number
          resource_id: string
        }
        Update: {
          activity_id?: string
          id?: string
          quantity?: number
          resource_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_resource_templates_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_resource_templates_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "resources"
            referencedColumns: ["id"]
          },
        ]
      }
      alerts: {
        Row: {
          created_at: string
          id: string
          kind: string
          message: string
          read: boolean
          reservation_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          message: string
          read?: boolean
          reservation_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          message?: string
          read?: boolean
          reservation_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "alerts_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "reservations"
            referencedColumns: ["id"]
          },
        ]
      }
      external_borrow_forms: {
        Row: {
          accepts_responsibility: boolean
          created_at: string
          departure_at: string | null
          destination: string | null
          id: string
          inventory_detail: string | null
          purpose: string | null
          reservation_id: string
          responsible_document: string | null
          responsible_name: string | null
          responsible_phone: string | null
          return_at: string | null
          transport_vehicle: string | null
        }
        Insert: {
          accepts_responsibility?: boolean
          created_at?: string
          departure_at?: string | null
          destination?: string | null
          id?: string
          inventory_detail?: string | null
          purpose?: string | null
          reservation_id: string
          responsible_document?: string | null
          responsible_name?: string | null
          responsible_phone?: string | null
          return_at?: string | null
          transport_vehicle?: string | null
        }
        Update: {
          accepts_responsibility?: boolean
          created_at?: string
          departure_at?: string | null
          destination?: string | null
          id?: string
          inventory_detail?: string | null
          purpose?: string | null
          reservation_id?: string
          responsible_document?: string | null
          responsible_name?: string | null
          responsible_phone?: string | null
          return_at?: string | null
          transport_vehicle?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "external_borrow_forms_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: true
            referencedRelation: "reservations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
        }
        Relationships: []
      }
      reservation_audit: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          details: Json | null
          id: number
          new_status: Database["public"]["Enums"]["reservation_status"] | null
          old_status: Database["public"]["Enums"]["reservation_status"] | null
          reservation_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          details?: Json | null
          id?: number
          new_status?: Database["public"]["Enums"]["reservation_status"] | null
          old_status?: Database["public"]["Enums"]["reservation_status"] | null
          reservation_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          details?: Json | null
          id?: number
          new_status?: Database["public"]["Enums"]["reservation_status"] | null
          old_status?: Database["public"]["Enums"]["reservation_status"] | null
          reservation_id?: string
        }
        Relationships: []
      }
      reservation_messages: {
        Row: {
          created_at: string
          id: string
          mensaje: string
          read_at: string | null
          reservation_id: string
          sender_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          mensaje: string
          read_at?: string | null
          reservation_id: string
          sender_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          mensaje?: string
          read_at?: string | null
          reservation_id?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reservation_messages_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "reservations"
            referencedColumns: ["id"]
          },
        ]
      }
      reservation_resources: {
        Row: {
          cantidad_aprobada: number | null
          id: string
          quantity: number
          reservation_id: string
          resource_id: string
        }
        Insert: {
          cantidad_aprobada?: number | null
          id?: string
          quantity: number
          reservation_id: string
          resource_id: string
        }
        Update: {
          cantidad_aprobada?: number | null
          id?: string
          quantity?: number
          reservation_id?: string
          resource_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reservation_resources_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "reservations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservation_resources_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "resources"
            referencedColumns: ["id"]
          },
        ]
      }
      reservations: {
        Row: {
          activity_id: string | null
          aulas_moviles_subtipo:
            | Database["public"]["Enums"]["am_subtipo"]
            | null
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string
          created_by: string | null
          docente_responsable_documento: string | null
          docente_responsable_nombre: string | null
          ends_at: string
          facultad_entidad: string | null
          fecha_solicitud: string
          id: string
          leaves_faculty: boolean
          lugar_tipo: Database["public"]["Enums"]["lugar_tipo"]
          notes: string | null
          participants: number
          programa: string | null
          rejection_reason: string | null
          requiere_ingreso_30min_antes: boolean
          reviewer_id: string | null
          semestre: number | null
          solicitante_documento: string | null
          solicitante_nombre: string | null
          space_id: string | null
          starts_at: string
          status: Database["public"]["Enums"]["reservation_status"]
          teacher_id: string
          telefono_contacto: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          activity_id?: string | null
          aulas_moviles_subtipo?:
            | Database["public"]["Enums"]["am_subtipo"]
            | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          created_by?: string | null
          docente_responsable_documento?: string | null
          docente_responsable_nombre?: string | null
          ends_at: string
          facultad_entidad?: string | null
          fecha_solicitud?: string
          id?: string
          leaves_faculty?: boolean
          lugar_tipo?: Database["public"]["Enums"]["lugar_tipo"]
          notes?: string | null
          participants?: number
          programa?: string | null
          rejection_reason?: string | null
          requiere_ingreso_30min_antes?: boolean
          reviewer_id?: string | null
          semestre?: number | null
          solicitante_documento?: string | null
          solicitante_nombre?: string | null
          space_id?: string | null
          starts_at: string
          status?: Database["public"]["Enums"]["reservation_status"]
          teacher_id: string
          telefono_contacto?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          activity_id?: string | null
          aulas_moviles_subtipo?:
            | Database["public"]["Enums"]["am_subtipo"]
            | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          created_by?: string | null
          docente_responsable_documento?: string | null
          docente_responsable_nombre?: string | null
          ends_at?: string
          facultad_entidad?: string | null
          fecha_solicitud?: string
          id?: string
          leaves_faculty?: boolean
          lugar_tipo?: Database["public"]["Enums"]["lugar_tipo"]
          notes?: string | null
          participants?: number
          programa?: string | null
          rejection_reason?: string | null
          requiere_ingreso_30min_antes?: boolean
          reviewer_id?: string | null
          semestre?: number | null
          solicitante_documento?: string | null
          solicitante_nombre?: string | null
          space_id?: string | null
          starts_at?: string
          status?: Database["public"]["Enums"]["reservation_status"]
          teacher_id?: string
          telefono_contacto?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reservations_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      resource_categories: {
        Row: {
          id: string
          kind: Database["public"]["Enums"]["resource_kind"]
          name: string
        }
        Insert: {
          id?: string
          kind: Database["public"]["Enums"]["resource_kind"]
          name: string
        }
        Update: {
          id?: string
          kind?: Database["public"]["Enums"]["resource_kind"]
          name?: string
        }
        Relationships: []
      }
      resources: {
        Row: {
          allows_external_exit: boolean
          category_id: string
          code: string | null
          created_at: string
          id: string
          name: string
          quantity_total: number
          status: Database["public"]["Enums"]["asset_status"]
        }
        Insert: {
          allows_external_exit?: boolean
          category_id: string
          code?: string | null
          created_at?: string
          id?: string
          name: string
          quantity_total?: number
          status?: Database["public"]["Enums"]["asset_status"]
        }
        Update: {
          allows_external_exit?: boolean
          category_id?: string
          code?: string | null
          created_at?: string
          id?: string
          name?: string
          quantity_total?: number
          status?: Database["public"]["Enums"]["asset_status"]
        }
        Relationships: [
          {
            foreignKeyName: "resources_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "resource_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      spaces: {
        Row: {
          capacity: number
          close_time: string
          created_at: string
          id: string
          name: string
          open_time: string
          status: Database["public"]["Enums"]["asset_status"]
          type: Database["public"]["Enums"]["space_type"]
        }
        Insert: {
          capacity: number
          close_time?: string
          created_at?: string
          id?: string
          name: string
          open_time?: string
          status?: Database["public"]["Enums"]["asset_status"]
          type?: Database["public"]["Enums"]["space_type"]
        }
        Update: {
          capacity?: number
          close_time?: string
          created_at?: string
          id?: string
          name?: string
          open_time?: string
          status?: Database["public"]["Enums"]["asset_status"]
          type?: Database["public"]["Enums"]["space_type"]
        }
        Relationships: []
      }
      surgical_instruments: {
        Row: {
          code: string | null
          id: string
          kit_id: string | null
          name: string
          status: Database["public"]["Enums"]["asset_status"]
          updated_at: string
        }
        Insert: {
          code?: string | null
          id?: string
          kit_id?: string | null
          name: string
          status?: Database["public"]["Enums"]["asset_status"]
          updated_at?: string
        }
        Update: {
          code?: string | null
          id?: string
          kit_id?: string | null
          name?: string
          status?: Database["public"]["Enums"]["asset_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "surgical_instruments_kit_id_fkey"
            columns: ["kit_id"]
            isOneToOne: false
            referencedRelation: "quirofano_instrumental"
            referencedColumns: ["kit_id"]
          },
          {
            foreignKeyName: "surgical_instruments_kit_id_fkey"
            columns: ["kit_id"]
            isOneToOne: false
            referencedRelation: "surgical_kits"
            referencedColumns: ["id"]
          },
        ]
      }
      surgical_kits: {
        Row: {
          id: string
          last_regrouped_at: string | null
          name: string
          notes: string | null
          resource_id: string | null
          status: Database["public"]["Enums"]["kit_status"]
        }
        Insert: {
          id?: string
          last_regrouped_at?: string | null
          name: string
          notes?: string | null
          resource_id?: string | null
          status?: Database["public"]["Enums"]["kit_status"]
        }
        Update: {
          id?: string
          last_regrouped_at?: string | null
          name?: string
          notes?: string | null
          resource_id?: string | null
          status?: Database["public"]["Enums"]["kit_status"]
        }
        Relationships: [
          {
            foreignKeyName: "surgical_kits_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: true
            referencedRelation: "resources"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      quirofano_instrumental: {
        Row: {
          kit_id: string | null
          kit_name: string | null
          kit_status: Database["public"]["Enums"]["kit_status"] | null
          last_regrouped_at: string | null
          piezas: Json | null
          piezas_disponibles: number | null
          total_piezas: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      aprobar_reserva: { Args: { _id: string }; Returns: undefined }
      aprobar_reserva_con_espacio: {
        Args: { _id: string; _space_id: string }
        Returns: undefined
      }
      cancelar_reserva: { Args: { _id: string }; Returns: undefined }
      check_resource_conflicts: {
        Args: { _reservation_id: string }
        Returns: undefined
      }
      crear_reserva: {
        Args: {
          _activity_id: string
          _ends_at: string
          _group_multiplier?: number
          _leaves_faculty?: boolean
          _notes?: string
          _participants?: number
          _space_id: string
          _starts_at: string
        }
        Returns: string
      }
      crear_solicitud_formulario: { Args: { _f: Json }; Returns: Json }
      dashboard_bloqueos: {
        Args: never
        Returns: {
          ends_at: string
          id: string
          kind: string
          name: string
          reservation_id: string
          starts_at: string
          status: string
        }[]
      }
      disponibilidad: {
        Args: { _ends_at: string; _starts_at: string }
        Returns: {
          available: number
          id: string
          kind: string
          name: string
          reserved: number
          status: string
          total: number
        }[]
      }
      external_form_complete: {
        Args: { _reservation_id: string }
        Returns: boolean
      }
      formulario_plantilla: {
        Args: { _activity_id: string }
        Returns: {
          cantidad: number
          categoria: Database["public"]["Enums"]["resource_kind"]
          detalle: string
          resource_id: string
        }[]
      }
      generar_alertas_proximas: { Args: never; Returns: number }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      marcar_mensajes_leidos: { Args: { _rid: string }; Returns: undefined }
      puede_ver_reserva: { Args: { _rid: string }; Returns: boolean }
      reasignar_espacio: {
        Args: { _id: string; _new_space_id: string }
        Returns: undefined
      }
      rechazar_reserva: {
        Args: { _id: string; _reason: string }
        Returns: undefined
      }
      reporte_uso_programa_docente: {
        Args: { _from: string; _to: string }
        Returns: {
          docente: string
          horas: number
          programa: string
          reservas: number
        }[]
      }
      reporte_utilizacion: {
        Args: { _from: string; _to: string }
        Returns: {
          horas: number
          id: string
          kind: string
          name: string
          reservas: number
        }[]
      }
    }
    Enums: {
      am_subtipo: "AOE" | "TA" | "PR"
      app_role: "DOCENTE" | "ADMINISTRADOR_REVISOR"
      asset_status:
        | "DISPONIBLE"
        | "RESERVADO"
        | "EN_MANTENIMIENTO"
        | "FUERA_DE_SERVICIO"
      kit_status: "COMPLETO" | "SEPARADO" | "INCOMPLETO" | "EN_ESTERILIZACION"
      lugar_tipo: "LDS" | "CEAPH" | "LL" | "AM"
      reservation_status:
        | "SOLICITADA"
        | "APROBADA"
        | "RECHAZADA"
        | "EN_CURSO"
        | "CANCELADA"
      resource_kind: "EQUIPO" | "SIMULADOR" | "INSUMO" | "PAQUETE_QUIRURGICO"
      space_type: "FIJO" | "MOVIL"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      am_subtipo: ["AOE", "TA", "PR"],
      app_role: ["DOCENTE", "ADMINISTRADOR_REVISOR"],
      asset_status: [
        "DISPONIBLE",
        "RESERVADO",
        "EN_MANTENIMIENTO",
        "FUERA_DE_SERVICIO",
      ],
      kit_status: ["COMPLETO", "SEPARADO", "INCOMPLETO", "EN_ESTERILIZACION"],
      lugar_tipo: ["LDS", "CEAPH", "LL", "AM"],
      reservation_status: [
        "SOLICITADA",
        "APROBADA",
        "RECHAZADA",
        "EN_CURSO",
        "CANCELADA",
      ],
      resource_kind: ["EQUIPO", "SIMULADOR", "INSUMO", "PAQUETE_QUIRURGICO"],
      space_type: ["FIJO", "MOVIL"],
    },
  },
} as const
